import { mkdir, readFile, writeFile } from 'node:fs/promises'
import { dirname } from 'node:path'
import {
  benchmarkScenarioDimensions,
  benchmarkScenarioExamples,
  benchmarkScenarios,
  type BenchmarkAdapter,
  type BenchmarkFunctionality,
  type BenchmarkPhase,
  type BenchmarkScenario,
  type BenchmarkSuite,
} from '../fixtures/scenario'
import type { BenchmarkEnvironment, SourceRevision } from './history'
import { METHODOLOGY_VERSION, type BenchmarkIdentity } from './provenance'

/** One complete in-memory client-to-server round trip. */
export type Benchmark = {
  /** Optional smaller batch for comparatively expensive integration measurements. */
  readonly iterations?: number
  readonly profile?: BenchmarkProfile
  readonly runtime: string
  /** Stable implementation identity used across package-version labels. */
  readonly runtimeKey?: string
  readonly scenario: BenchmarkScenario
  readonly warmup?: number
  readonly run: () => Promise<void>
}

export type BenchmarkProfile = 'application' | 'focused' | 'native' | 'strict-parity'
type BenchmarkImplementation = '@hulla/api' | 'direct' | 'hono' | 'orpc' | 'trpc' | 'ts-rest'
type BenchmarkProtocol = 'direct' | 'rest' | 'rpc'

export type BenchmarkDimensions = {
  readonly adapter: BenchmarkAdapter
  readonly functionality: BenchmarkFunctionality
  readonly implementation: BenchmarkImplementation
  readonly phase: BenchmarkPhase
  readonly protocol: BenchmarkProtocol
  readonly suite: BenchmarkSuite
}

const benchmarkProfiles: Readonly<Record<BenchmarkProfile, { readonly description: string; readonly title: string }>> =
  {
    application: {
      title: 'Representative application requests',
      description:
        'Common REST-shaped reads and writes covering path parameters, query values, headers, and JSON bodies. RPC packages carry the equivalent values through their native protocol.',
    },
    'strict-parity': {
      title: 'Equivalent validation policy',
      description:
        'Server input, server output, and client output are validated; no manually added client input validation. HTTP/RPC protocol differences remain explicit.',
    },
    native: {
      title: 'Recommended everyday setup',
      description:
        'Each package uses its simplest practical validated/recommended path. Runtime guarantees differ, so these results show idiomatic cost rather than equal-capability performance.',
    },
    focused: {
      title: 'Focused @hulla/api diagnostics',
      description:
        'These isolate @hulla/api feature costs against direct equivalents. They are implementation diagnostics, not cross-package rankings.',
    },
  }

export type BenchmarkOptions = {
  readonly iterations: number
  readonly minSampleTimeMs: number
  readonly runs: number
  readonly samples: number
  readonly warmup: number
}

export type BenchmarkComparison = {
  readonly basis: 'direct-normalized' | 'raw'
  readonly change: number
  readonly confidenceHigh: number
  readonly confidenceLow: number
  readonly verdict: 'faster' | 'inconclusive' | 'negligible' | 'slower'
}

export type BenchmarkResult = {
  readonly adapter: BenchmarkAdapter
  readonly coefficientOfVariation: number
  readonly confidenceHigh: number
  readonly confidenceLow: number
  readonly functionality: BenchmarkFunctionality
  readonly implementation: BenchmarkImplementation
  readonly iterations: number
  readonly max: number
  readonly mean: number
  readonly median: number
  readonly min: number
  readonly phase: BenchmarkPhase
  readonly profile: BenchmarkProfile
  readonly protocol: BenchmarkProtocol
  readonly rawComparison?: BenchmarkComparison
  readonly comparison?: BenchmarkComparison
  readonly previousMedian?: number
  readonly runs: number
  readonly runtime: string
  readonly runtimeKey: string
  readonly scenario: BenchmarkScenario
  readonly samples: readonly number[]
  readonly sampleGroups?: readonly (readonly number[])[]
  readonly processId?: number
  readonly processIds?: readonly number[]
  readonly standardDeviation: number
  readonly suite: BenchmarkSuite
  readonly warmup: number
}

export type PackageSizeResult = {
  readonly comparison: 'breakdown' | 'executable'
  readonly gzipBytes: number
  readonly imports: string
  readonly minifiedBytes: number
  readonly runtime: string
}

export type IndependentAdapterCohortResult = {
  readonly cohort: {
    readonly adapter: Exclude<BenchmarkAdapter, 'none'>
    readonly competitor: BenchmarkImplementation
  }
  readonly results: readonly BenchmarkResult[]
}

function positiveInteger(name: string, fallback: number): number {
  const value = process.env[name]
  if (value === undefined) return fallback
  const parsed = Number(value)
  if (!Number.isSafeInteger(parsed) || parsed <= 0) throw new TypeError(`${name} must be a positive integer`)
  return parsed
}

export function benchmarkOptions(): BenchmarkOptions {
  return {
    iterations: positiveInteger('BENCH_ITERATIONS', 5_000),
    minSampleTimeMs: positiveInteger('BENCH_MIN_SAMPLE_MS', 20),
    runs: positiveInteger('BENCH_RUNS', 3),
    samples: positiveInteger('BENCH_SAMPLES', 7),
    warmup: positiveInteger('BENCH_WARMUP', 1_000),
  }
}

function median(values: readonly number[]): number {
  const sorted = [...values].sort((left, right) => left - right)
  const middle = Math.floor(sorted.length / 2)
  if (sorted.length % 2 === 1) return sorted[middle]!
  return (sorted[middle - 1]! + sorted[middle]!) / 2
}

function percentile(values: readonly number[], fraction: number): number {
  const sorted = [...values].sort((left, right) => left - right)
  const position = (sorted.length - 1) * fraction
  const lower = Math.floor(position)
  const upper = Math.ceil(position)
  if (lower === upper) return sorted[lower]!
  const weight = position - lower
  return sorted[lower]! * (1 - weight) + sorted[upper]! * weight
}

function sampleSeed(groups: readonly (readonly number[])[]): number {
  let seed = 2_166_136_261
  for (const values of groups) {
    for (const value of values) {
      const scaled = Math.round(value * 1_000)
      seed ^= scaled
      seed = Math.imul(seed, 16_777_619)
    }
  }
  return seed >>> 0 || 1
}

function random(seed: number): () => number {
  let state = seed >>> 0 || 1
  return () => {
    state ^= state << 13
    state ^= state >>> 17
    state ^= state << 5
    return (state >>> 0) / 4_294_967_296
  }
}

function resampledMedian(values: readonly number[], next: () => number): number {
  const sample = Array.from({ length: values.length }, () => values[Math.floor(next() * values.length)]!)
  return median(sample)
}

function resampledMedianRatio(target: readonly number[], direct: readonly number[], next: () => number): number {
  const length = Math.min(target.length, direct.length)
  const targetSample: number[] = []
  const directSample: number[] = []
  for (let index = 0; index < length; index++) {
    const selected = Math.floor(next() * length)
    targetSample.push(target[selected]!)
    directSample.push(direct[selected]!)
  }
  return median(targetSample) / median(directSample)
}

/** Deterministic non-parametric bootstrap interval for a sample median. */
export function medianConfidenceInterval(
  samples: readonly number[],
  resamples = 2_000
): { readonly high: number; readonly low: number } {
  const next = random(sampleSeed([samples]))
  const estimates = Array.from({ length: resamples }, () => resampledMedian(samples, next))
  return { low: percentile(estimates, 0.025), high: percentile(estimates, 0.975) }
}

/**
 * Compares independent benchmark samples. When direct baselines are supplied, the
 * reported change is a ratio-of-ratios that compensates for machine-wide drift.
 */
export function compareBenchmarkSamples(
  current: readonly number[],
  previous: readonly number[],
  currentDirect?: readonly number[],
  previousDirect?: readonly number[],
  minimumEffect = 0.02,
  resamples = 2_000
): BenchmarkComparison {
  const normalized = currentDirect !== undefined && previousDirect !== undefined
  const estimate = (target: readonly number[], direct?: readonly number[]) =>
    direct === undefined ? median(target) : median(target) / median(direct)
  const change = estimate(current, currentDirect) / estimate(previous, previousDirect) - 1
  const groups = [current, previous, ...(normalized ? [currentDirect!, previousDirect!] : [])]
  const next = random(sampleSeed(groups))
  const changes = Array.from({ length: resamples }, () => {
    if (!normalized) return resampledMedian(current, next) / resampledMedian(previous, next) - 1
    const currentRatio = resampledMedianRatio(current, currentDirect, next)
    const previousRatio = resampledMedianRatio(previous, previousDirect, next)
    return currentRatio / previousRatio - 1
  })
  const confidenceLow = percentile(changes, 0.025)
  const confidenceHigh = percentile(changes, 0.975)
  const verdict =
    confidenceLow >= -minimumEffect && confidenceHigh <= minimumEffect
      ? 'negligible'
      : confidenceHigh < -minimumEffect
        ? 'faster'
        : confidenceLow > minimumEffect
          ? 'slower'
          : 'inconclusive'
  return {
    basis: normalized ? 'direct-normalized' : 'raw',
    change,
    confidenceHigh,
    confidenceLow,
    verdict: current.length < 3 || previous.length < 3 ? 'inconclusive' : verdict,
  }
}

function standardDeviation(values: readonly number[]): number {
  const average = values.reduce((total, value) => total + value, 0) / values.length
  return Math.sqrt(values.reduce((total, value) => total + (value - average) ** 2, 0) / values.length)
}

const implementationPrefixes: readonly {
  readonly implementation: BenchmarkImplementation
  readonly prefix: string
  readonly protocol: BenchmarkProtocol
}[] = [
  { implementation: 'direct', prefix: 'Direct ', protocol: 'direct' },
  { implementation: '@hulla/api', prefix: '@hulla/api', protocol: 'rest' },
  { implementation: 'ts-rest', prefix: 'ts-rest', protocol: 'rest' },
  { implementation: 'trpc', prefix: 'tRPC', protocol: 'rpc' },
  { implementation: 'orpc', prefix: 'oRPC', protocol: 'rpc' },
  { implementation: 'hono', prefix: 'Hono Fetch', protocol: 'rest' },
  { implementation: 'hono', prefix: 'Hono', protocol: 'rpc' },
]

export function benchmarkDimensions(runtimeKey: string, scenario: BenchmarkScenario): BenchmarkDimensions {
  const identity = implementationPrefixes.find(({ prefix }) => runtimeKey.startsWith(prefix))
  if (identity === undefined) throw new TypeError(`Unknown benchmark implementation: ${runtimeKey}`)
  return { ...benchmarkScenarioDimensions[scenario], ...identity }
}

export function summarizeBenchmarkResult(
  profile: BenchmarkProfile,
  runtime: string,
  scenario: BenchmarkScenario,
  samples: readonly number[],
  runs = 1,
  runtimeKey = runtime,
  dimensions = benchmarkDimensions(runtimeKey, scenario),
  iterations = 0,
  warmup = 0
): BenchmarkResult {
  const mean = samples.reduce((total, value) => total + value, 0) / samples.length
  const deviation = standardDeviation(samples)
  const confidence = medianConfidenceInterval(samples)
  return {
    adapter: dimensions.adapter,
    coefficientOfVariation: mean === 0 ? 0 : deviation / mean,
    confidenceHigh: confidence.high,
    confidenceLow: confidence.low,
    functionality: dimensions.functionality,
    implementation: dimensions.implementation,
    iterations,
    max: Math.max(...samples),
    mean,
    median: median(samples),
    min: Math.min(...samples),
    phase: dimensions.phase,
    profile,
    protocol: dimensions.protocol,
    runs,
    runtime,
    runtimeKey,
    samples: [...samples],
    scenario,
    standardDeviation: deviation,
    suite: dimensions.suite,
    warmup,
  }
}

/** Runs are the sampling units; batches within one run are correlated. */
export function independentSamples(result: Pick<BenchmarkResult, 'samples' | 'sampleGroups'>): readonly number[] {
  return (result.sampleGroups ?? [result.samples]).map(median)
}

export function withSampleGroups(result: BenchmarkResult, groups: readonly (readonly number[])[]): BenchmarkResult {
  const confidence = medianConfidenceInterval(groups.map(median))
  return { ...result, sampleGroups: groups, confidenceLow: confidence.low, confidenceHigh: confidence.high }
}

function formatMicroseconds(nanoseconds: number): string {
  return (nanoseconds / 1_000).toFixed(2)
}

function formatOps(nanoseconds: number): string {
  return Math.round(1_000_000_000 / nanoseconds).toLocaleString('en-US')
}

function formatBytes(bytes: number): string {
  return `${(bytes / 1_024).toFixed(2)} KiB`
}

function formatPercent(value: number): string {
  return `${value >= 0 ? '+' : ''}${(value * 100).toFixed(1)}%`
}

function formatRatio(value: number, baseline: number): string {
  return `${(value / baseline).toFixed(2)}×`
}

function formatShare(value: number, baseline: number): string {
  return `${((value / baseline) * 100).toFixed(1)}%`
}

function formatMedian(result: BenchmarkResult): string {
  return `${formatMicroseconds(result.median)} [${formatMicroseconds(result.confidenceLow)}, ${formatMicroseconds(result.confidenceHigh)}] µs`
}

function formatComparison(result: BenchmarkResult): string {
  const comparison = result.comparison
  if (comparison === undefined) return '—'
  const raw = result.rawComparison === undefined ? '' : `; raw ${formatPercent(result.rawComparison.change)}`
  const basis = comparison.basis === 'direct-normalized' ? 'normalized' : 'raw'
  return `${formatPercent(comparison.change)} [${formatPercent(comparison.confidenceLow)}, ${formatPercent(comparison.confidenceHigh)}] · ${comparison.verdict} (${basis}${raw})`
}

function profileOrder(): readonly BenchmarkProfile[] {
  return ['native', 'application', 'strict-parity', 'focused']
}

type ApplicationSummary = {
  readonly directRatio: number
  readonly hullaApiRatio: number
  readonly runtime: string
  readonly scenarios: number
  readonly signals: readonly string[]
}

function applicationSummaries(results: readonly BenchmarkResult[]): readonly ApplicationSummary[] {
  const application = results.filter(({ profile }) => profile === 'application')
  const scenarios = [...new Set(application.map(({ scenario }) => scenario))]
  if (scenarios.length === 0) return []
  const runtimes = [...new Set(application.map(({ runtimeKey }) => runtimeKey))]
  const geometricMean = (values: readonly number[]) =>
    Math.exp(values.reduce((total, value) => total + Math.log(value), 0) / values.length)
  return runtimes.flatMap((runtimeKey) => {
    const selected = scenarios.flatMap((scenario) => {
      const result = application.find(
        (candidate) => candidate.runtimeKey === runtimeKey && candidate.scenario === scenario
      )
      const direct = application.find(
        (candidate) => candidate.runtimeKey.startsWith('Direct ') && candidate.scenario === scenario
      )
      const hullaApi = application.find(
        (candidate) => candidate.runtimeKey.startsWith('@hulla/api') && candidate.scenario === scenario
      )
      return result === undefined || direct === undefined || hullaApi === undefined
        ? []
        : [{ direct: result.median / direct.median, hullaApi: result.median / hullaApi.median, result }]
    })
    if (selected.length !== scenarios.length) return []
    return [
      {
        directRatio: geometricMean(selected.map(({ direct }) => direct)),
        hullaApiRatio: geometricMean(selected.map(({ hullaApi }) => hullaApi)),
        runtime: selected[0]!.result.runtime,
        scenarios: selected.length,
        signals: selected
          .filter(({ result }) => result.comparison?.verdict === 'faster' || result.comparison?.verdict === 'slower')
          .map(({ result }) => `${result.scenario}: ${result.comparison!.verdict}`),
      },
    ]
  })
}

function applicationSummaryRow(summary: ApplicationSummary): string {
  return `| ${summary.runtime} | ${summary.scenarios} | ${summary.directRatio.toFixed(2)}× | ${summary.hullaApiRatio.toFixed(2)}× | ${summary.signals.length === 0 ? 'none' : summary.signals.join(', ')} |`
}

function printApplicationSummary(results: readonly BenchmarkResult[]): void {
  const summaries = applicationSummaries(results)
  if (summaries.length === 0) return
  console.log('\nApplication-mix summary (geometric mean of per-scenario ratios; lower is faster)')
  console.log('| Runtime | Scenarios | vs direct | vs @hulla/api | Clear signals vs prior |')
  console.log('|---|---:|---:|---:|---|')
  for (const summary of summaries) console.log(applicationSummaryRow(summary))
}

const implementationOrder: readonly BenchmarkImplementation[] = [
  'direct',
  '@hulla/api',
  'ts-rest',
  'trpc',
  'orpc',
  'hono',
]

type AggregateSelector = {
  readonly profile: BenchmarkProfile
  readonly scenario: BenchmarkScenario
}

type AggregateCohort = {
  readonly adapter: BenchmarkAdapter
  readonly selectors: readonly AggregateSelector[]
  readonly title: string
}

const aggregateCohorts: readonly AggregateCohort[] = [
  {
    title: 'Recommended everyday setup',
    adapter: 'fetch',
    selectors: [
      { profile: 'native', scenario: 'static-get' },
      { profile: 'native', scenario: 'small-json-post' },
      { profile: 'native', scenario: 'large-json-post' },
    ],
  },
  {
    title: 'Representative application requests',
    adapter: 'fetch',
    selectors: [
      { profile: 'application', scenario: 'path-parameter-read' },
      { profile: 'application', scenario: 'query-header-read' },
      { profile: 'application', scenario: 'mixed-update' },
    ],
  },
  {
    title: 'Equivalent validation policy',
    adapter: 'fetch',
    selectors: [
      { profile: 'strict-parity', scenario: 'static-get' },
      { profile: 'strict-parity', scenario: 'small-json-post' },
      { profile: 'strict-parity', scenario: 'large-json-post' },
    ],
  },

  {
    title: 'Adapter dispatch',
    adapter: 'fetch',
    selectors: [
      { profile: 'native', scenario: 'fetch-adapter-static-dispatch' },
      { profile: 'native', scenario: 'fetch-adapter-dynamic-dispatch' },
    ],
  },
  {
    title: 'Adapter dispatch',
    adapter: 'express',
    selectors: [
      { profile: 'native', scenario: 'adapter-static-dispatch' },
      { profile: 'native', scenario: 'adapter-dynamic-dispatch' },
    ],
  },
  {
    title: 'Real in-process HTTP round trips',
    adapter: 'express',
    selectors: [
      { profile: 'native', scenario: 'express-http-static-roundtrip' },
      { profile: 'native', scenario: 'express-http-dynamic-roundtrip' },
    ],
  },
  {
    title: 'Next.js Route Handler dispatch',
    adapter: 'next',
    selectors: [
      { profile: 'native', scenario: 'next-adapter-static-dispatch' },
      { profile: 'native', scenario: 'next-adapter-dynamic-dispatch' },
    ],
  },
  {
    title: 'TanStack Start server-route dispatch',
    adapter: 'tanstack-start',
    selectors: [
      { profile: 'native', scenario: 'tanstack-start-adapter-static-dispatch' },
      { profile: 'native', scenario: 'tanstack-start-adapter-dynamic-dispatch' },
    ],
  },
  {
    title: 'SolidStart API-route dispatch',
    adapter: 'solid-start',
    selectors: [
      { profile: 'native', scenario: 'solid-start-adapter-static-dispatch' },
      { profile: 'native', scenario: 'solid-start-adapter-dynamic-dispatch' },
    ],
  },
  {
    title: 'SvelteKit endpoint dispatch',
    adapter: 'sveltekit',
    selectors: [
      { profile: 'native', scenario: 'sveltekit-adapter-static-dispatch' },
      { profile: 'native', scenario: 'sveltekit-adapter-dynamic-dispatch' },
    ],
  },
]

function adapterTitle(adapter: BenchmarkAdapter): string {
  switch (adapter) {
    case 'cloudflare':
      return 'Cloudflare Workers'
    case 'express':
      return 'Express'
    case 'fastify':
      return 'Fastify'
    case 'fetch':
      return 'Fetch'
    case 'h3':
      return 'H3'
    case 'hono':
      return 'Hono'
    case 'next':
      return 'Next.js'
    case 'tanstack-start':
      return 'TanStack Start'
    case 'solid-start':
      return 'SolidStart'
    case 'sveltekit':
      return 'SvelteKit'
    case 'none':
      return 'No host adapter'
  }
}

function benchmarkRatio(result: BenchmarkResult, baseline: BenchmarkResult | undefined): string {
  return baseline === undefined ? '—' : `${(result.median / baseline.median).toFixed(2)}×`
}

function comparisonInterval(result: BenchmarkResult): string {
  const comparison = result.comparison
  if (comparison === undefined) return '—'
  const basis = comparison.basis === 'direct-normalized' ? 'direct-normalized' : 'raw'
  const raw = result.rawComparison
  const absolute =
    raw === undefined
      ? ''
      : `; raw ${formatPercent(raw.change)} [${formatPercent(raw.confidenceLow)}, ${formatPercent(raw.confidenceHigh)}]`
  return `${formatPercent(comparison.change)} [${formatPercent(comparison.confidenceLow)}, ${formatPercent(comparison.confidenceHigh)}] (${basis})${absolute}`
}

function hullaApiReference(results: readonly BenchmarkResult[]): BenchmarkResult | undefined {
  const candidates = results.filter(({ implementation }) => implementation === '@hulla/api')
  return (
    candidates.find(({ runtimeKey }) => runtimeKey === '@hulla/api') ??
    (candidates.length === 1 ? candidates[0] : undefined)
  )
}

function aggregateResult(
  results: readonly BenchmarkResult[],
  cohort: AggregateCohort,
  implementation: BenchmarkImplementation
): string {
  const ratios = cohort.selectors.flatMap((selector) => {
    const selected = results.filter(
      (result) => result.profile === selector.profile && result.scenario === selector.scenario
    )
    const hullaApi = hullaApiReference(selected)
    const result =
      implementation === '@hulla/api'
        ? hullaApi
        : selected.find((candidate) => candidate.implementation === implementation)
    return result === undefined || hullaApi === undefined ? [] : [result.median / hullaApi.median]
  })
  if (ratios.length !== cohort.selectors.length) return '—'
  const geometricMean = Math.exp(ratios.reduce((total, ratio) => total + Math.log(ratio), 0) / ratios.length)
  return `${geometricMean.toFixed(2)}×`
}

function aggregateResultLines(results: readonly BenchmarkResult[]): readonly string[] {
  if (results.length === 0) return []
  const availableCohorts = aggregateCohorts.filter((cohort) =>
    cohort.selectors.some((selector) =>
      results.some((result) => result.profile === selector.profile && result.scenario === selector.scenario)
    )
  )
  if (availableCohorts.length === 0) return []
  return [
    '',
    '## Cross-package overview',
    '',
    'Geometric mean of each package’s median-latency ratio to @hulla/api across the listed operations. Lower is faster; `1.00×` is @hulla/api. A cell is omitted unless that package has every operation in the cohort.',
    '',
    '| Cohort | Adapter | Operations | Direct | @hulla/api | ts-rest | tRPC | oRPC | Hono |',
    '|---|---|---:|---:|---:|---:|---:|---:|---:|',
    ...availableCohorts.map(
      (cohort) =>
        `| ${cohort.title} | ${adapterTitle(cohort.adapter)} | ${cohort.selectors.length} | ${implementationOrder.map((implementation) => aggregateResult(results, cohort, implementation)).join(' | ')} |`
    ),
  ]
}

function implementationTitle(implementation: BenchmarkImplementation): string {
  switch (implementation) {
    case '@hulla/api':
      return '@hulla/api'
    case 'direct':
      return 'direct'
    case 'hono':
      return 'Hono'
    case 'orpc':
      return 'oRPC'
    case 'trpc':
      return 'tRPC'
    case 'ts-rest':
      return 'ts-rest'
  }
}

function independentCohortRatioValue(
  results: readonly BenchmarkResult[],
  implementation: BenchmarkImplementation,
  baselineImplementation: BenchmarkImplementation = '@hulla/api'
): number | undefined {
  const scenarios = [...new Set(results.map(({ scenario }) => scenario))]
  const ratios = scenarios.flatMap((scenario) => {
    const selected = results.filter((result) => result.scenario === scenario)
    const baseline = selected.find(({ implementation }) => implementation === baselineImplementation)
    const result = selected.find((candidate) => candidate.implementation === implementation)
    return baseline === undefined || result === undefined ? [] : [result.median / baseline.median]
  })
  if (ratios.length !== scenarios.length) return undefined
  return Math.exp(ratios.reduce((total, ratio) => total + Math.log(ratio), 0) / ratios.length)
}

function independentCohortRatio(
  results: readonly BenchmarkResult[],
  implementation: BenchmarkImplementation,
  baselineImplementation: BenchmarkImplementation = '@hulla/api'
): string {
  const ratio = independentCohortRatioValue(results, implementation, baselineImplementation)
  return ratio === undefined ? '—' : `${ratio.toFixed(2)}×`
}

function independentCohortDifference(
  results: readonly BenchmarkResult[],
  implementation: BenchmarkImplementation,
  baselineImplementation: BenchmarkImplementation = '@hulla/api'
): string {
  const ratio = independentCohortRatioValue(results, implementation, baselineImplementation)
  if (ratio === undefined) return '—'
  const change = ratio - 1
  return `${change >= 0 ? '+' : ''}${(change * 100).toFixed(1)}%`
}

function independentCohortLatency(
  results: readonly BenchmarkResult[],
  implementation: BenchmarkImplementation
): string {
  const scenarios = [...new Set(results.map(({ scenario }) => scenario))]
  const medians = scenarios.flatMap((scenario) => {
    const result = results.find(
      (candidate) => candidate.scenario === scenario && candidate.implementation === implementation
    )
    return result === undefined ? [] : [result.median]
  })
  if (medians.length !== scenarios.length) return '—'
  const geometricMean = Math.exp(medians.reduce((total, median) => total + Math.log(median), 0) / medians.length)
  return `${formatMicroseconds(geometricMean)} µs`
}

function adapterCohortAnchor(cohort: IndependentAdapterCohortResult['cohort']): string {
  return `${cohort.adapter}-hullaapi-vs-${cohort.competitor}`
}

function independentAdapterSummaryLines(cohorts: readonly IndependentAdapterCohortResult[]): readonly string[] {
  if (cohorts.length === 0) return []
  return [
    '',
    '## Framework adapter overview',
    '',
    'Every aggregate is a geometric mean across the row’s per-operation medians. The difference column is the comparison latency minus the @hulla/api latency, expressed relative to @hulla/api; negative is faster. Ratio columns divide the first named implementation by the second, and lower is faster. Each cohort ran in a fresh process with its own baselines, so values must not be compared across rows.',
    '',
    '| Adapter | Comparison | Comparison latency difference vs @hulla/api (geometric mean) | Operations | @hulla/api latency (geometric mean) | Comparison latency (geometric mean) | Comparison / @hulla/api latency ratio (geometric mean) | @hulla/api / direct latency ratio (geometric mean) |',
    '|---|---|---:|---:|---:|---:|---:|---:|',
    ...cohorts.map(({ cohort, results }) => {
      const operations = new Set(results.map(({ scenario }) => scenario)).size
      const comparison = `[${implementationTitle(cohort.competitor)}](adapters-latest.md#${adapterCohortAnchor(cohort)})`
      return `| ${adapterTitle(cohort.adapter)} | ${comparison} | ${independentCohortDifference(results, cohort.competitor)} | ${operations} | ${independentCohortLatency(results, '@hulla/api')} | ${independentCohortLatency(results, cohort.competitor)} | ${independentCohortRatio(results, cohort.competitor)} | ${independentCohortRatio(results, '@hulla/api', 'direct')} |`
    }),
  ]
}

export async function updateBenchmarkReportAdapterSummary(
  path: string,
  cohorts: readonly IndependentAdapterCohortResult[]
): Promise<boolean> {
  if (cohorts.length === 0) return false
  let report: string
  try {
    report = await readFile(path, 'utf8')
  } catch (cause) {
    if (typeof cause === 'object' && cause !== null && 'code' in cause && cause.code === 'ENOENT') return false
    throw cause
  }

  const contentsLink = '- [Framework adapter overview](#framework-adapter-overview)'
  if (!report.includes(contentsLink)) {
    report = report.replace(
      '- [Cross-package overview](#cross-package-overview)\n',
      `- [Cross-package overview](#cross-package-overview)\n${contentsLink}\n`
    )
  }

  const summary = `${independentAdapterSummaryLines(cohorts).join('\n')}\n`
  const heading = '\n## Framework adapter overview\n'
  const existingStart = report.indexOf(heading)
  if (existingStart >= 0) {
    const existingEnd = report.indexOf('\n## ', existingStart + heading.length)
    report =
      existingEnd < 0
        ? `${report.slice(0, existingStart)}${summary}`
        : `${report.slice(0, existingStart)}${summary}${report.slice(existingEnd)}`
  } else {
    const insertionPoint = report.indexOf('\n## Measured operation comparisons\n')
    if (insertionPoint < 0) return false
    report = `${report.slice(0, insertionPoint)}${summary}${report.slice(insertionPoint)}`
  }

  await writeFile(path, report, 'utf8')
  return true
}

function resultOrder(left: BenchmarkResult, right: BenchmarkResult): number {
  const implementationDifference =
    implementationOrder.indexOf(left.implementation) - implementationOrder.indexOf(right.implementation)
  return implementationDifference || left.runtime.localeCompare(right.runtime)
}

function detailedResultLines(results: readonly BenchmarkResult[]): readonly string[] {
  if (results.length === 0) return []
  const lines: string[] = [
    '',
    '## Measured operation comparisons',
    '',
    'Every measured operation is listed below in its host environment. Latencies are medians with deterministic 95% run-level bootstrap intervals; lower is faster. Ratios compare medians within the same operation and adapter. The previous-change column reports the exact change and interval, not a qualitative summary.',
  ]

  for (const adapter of [
    'fetch',
    'express',
    'fastify',
    'h3',
    'hono',
    'cloudflare',
    'next',
    'tanstack-start',
    'solid-start',
    'sveltekit',
    'none',
  ] as const) {
    const adapterResults = results.filter((result) => result.adapter === adapter)
    if (adapterResults.length === 0) continue
    lines.push('', `### ${adapter === 'none' ? adapterTitle(adapter) : `${adapterTitle(adapter)} adapter`}`)

    for (const selectedProfile of profileOrder()) {
      const profileResults = adapterResults.filter((result) => result.profile === selectedProfile)
      if (profileResults.length === 0) continue
      const profile = benchmarkProfiles[selectedProfile]
      lines.push('', `#### ${profile.title}`, '', profile.description)

      for (const scenario of Object.keys(benchmarkScenarios) as BenchmarkScenario[]) {
        const scenarioResults = profileResults.filter((result) => result.scenario === scenario)
        if (scenarioResults.length === 0) continue
        const description = benchmarkScenarios[scenario]
        const direct = scenarioResults.find(({ implementation }) => implementation === 'direct')
        const hullaApi = hullaApiReference(scenarioResults)
        lines.push(
          '',
          `##### ${description}`,
          '',
          '```text',
          benchmarkScenarioExamples[scenario],
          '```',
          '',
          '| Package / implementation | Median [95% CI] | Min–max | vs direct | vs @hulla/api | Change from previous [95% CI] |',
          '|---|---:|---:|---:|---:|---|'
        )
        for (const result of [...scenarioResults].sort(resultOrder)) {
          lines.push(
            `| ${result.runtime} | ${formatMedian(result)} | ${formatMicroseconds(result.min)}–${formatMicroseconds(result.max)} µs | ${benchmarkRatio(result, direct)} | ${benchmarkRatio(result, hullaApi)} | ${comparisonInterval(result)} |`
          )
        }
      }
    }
  }
  return lines
}

async function runBenchmarks(
  benchmarks: readonly Benchmark[],
  options: BenchmarkOptions,
  runIndex = 0
): Promise<readonly BenchmarkResult[]> {
  for (const benchmark of benchmarks) {
    try {
      for (let iteration = 0; iteration < (benchmark.warmup ?? options.warmup); iteration++) await benchmark.run()
    } catch (cause) {
      throw new Error(`Benchmark warmup failed: ${profileLabel(benchmark)}`, { cause })
    }
  }

  const measurements = new Map<string, number[]>()
  const profile = (benchmark: Benchmark): BenchmarkProfile => benchmark.profile ?? 'strict-parity'
  const runtimeKey = (benchmark: Benchmark): string => benchmark.runtimeKey ?? benchmark.runtime
  const key = (benchmark: Benchmark) => `${profile(benchmark)}\0${benchmark.scenario}\0${runtimeKey(benchmark)}`
  for (const benchmark of benchmarks) measurements.set(key(benchmark), [])

  for (let sample = 0; sample < options.samples; sample++) {
    const shuffled = [...benchmarks]
    const next = random((runIndex + 1) * 65_537 + sample + 1)
    for (let index = shuffled.length - 1; index > 0; index--) {
      const swap = Math.floor(next() * (index + 1))
      ;[shuffled[index], shuffled[swap]] = [shuffled[swap]!, shuffled[index]!]
    }
    for (const benchmark of shuffled) {
      let elapsed = 0
      let measuredIterations = 0
      try {
        do {
          const start = performance.now()
          const iterations = benchmark.iterations ?? options.iterations
          for (let iteration = 0; iteration < iterations; iteration++) await benchmark.run()
          elapsed += performance.now() - start
          measuredIterations += iterations
        } while (elapsed < options.minSampleTimeMs)
      } catch (cause) {
        throw new Error(`Benchmark sample failed: ${profileLabel(benchmark)}`, { cause })
      }
      measurements.get(key(benchmark))!.push((elapsed * 1_000_000) / measuredIterations)
    }
  }

  return benchmarks.map((benchmark) =>
    summarizeBenchmarkResult(
      profile(benchmark),
      benchmark.runtime,
      benchmark.scenario,
      measurements.get(key(benchmark))!,
      1,
      runtimeKey(benchmark),
      benchmarkDimensions(runtimeKey(benchmark), benchmark.scenario),
      benchmark.iterations ?? options.iterations,
      benchmark.warmup ?? options.warmup
    )
  )
}

function profileLabel(benchmark: Benchmark): string {
  return `${benchmark.profile ?? 'strict-parity'} / ${benchmark.scenario} / ${benchmark.runtime}`
}

export async function runBenchmarkRuns(
  benchmarks: readonly Benchmark[],
  options: BenchmarkOptions,
  onRun?: (completed: number, total: number) => void
): Promise<readonly BenchmarkResult[]> {
  const completed: (readonly BenchmarkResult[])[] = []
  for (let run = 0; run < options.runs; run++) {
    onRun?.(run + 1, options.runs)
    completed.push(await runBenchmarks(benchmarks, options, run))
  }
  return completed[0]!.map((result, index) => {
    const groups = completed.map((run) => run[index]!.samples)
    const summary = summarizeBenchmarkResult(
      result.profile,
      result.runtime,
      result.scenario,
      groups.flat(),
      options.runs,
      result.runtimeKey,
      benchmarkDimensions(result.runtimeKey, result.scenario),
      result.iterations,
      result.warmup
    )
    return { ...withSampleGroups(summary, groups), processId: process.pid }
  })
}

export function printResults(
  results: readonly BenchmarkResult[],
  options: BenchmarkOptions,
  compatibleRuns = 1,
  previousLabel?: string
): void {
  const sampleCount = results[0]?.samples.length ?? options.samples * compatibleRuns
  console.log(
    `${runtimeLabel()} · ${compatibleRuns} compatible ${compatibleRuns === 1 ? 'run' : 'runs'} · ${sampleCount} samples · ≥${options.minSampleTimeMs} ms per sample`
  )
  if (previousLabel !== undefined) {
    console.log(`Previous revision: ${previousLabel}`)
    console.log(
      'Previous-change intervals are 95% run-level bootstraps; package rows are normalized to matching direct drift.'
    )
  }
  printApplicationSummary(results)
  for (const selectedProfile of profileOrder()) {
    const profile = benchmarkProfiles[selectedProfile]
    console.log(`\n${profile.title}`)
    console.log(profile.description)
    for (const [scenario, description] of Object.entries(benchmarkScenarios)) {
      const scenarioResults = results.filter(
        (result) => result.profile === selectedProfile && result.scenario === scenario
      )
      const direct = scenarioResults.find(({ runtimeKey }) => runtimeKey.startsWith('Direct '))?.median
      const hullaApi = scenarioResults.find(({ runtimeKey }) => runtimeKey.startsWith('@hulla/api'))?.median
      if (scenarioResults.length === 0 || direct === undefined || hullaApi === undefined) continue
      console.log(`\n${description}`)
      console.log(
        '| Runtime | Median batch-average cost [95% CI] | CV | Samples | Sequential ops/sec | vs direct | vs @hulla/api | vs previous [95% CI] |'
      )
      console.log('|---|---:|---:|---:|---:|---:|---:|---|')
      for (const result of scenarioResults) {
        console.log(
          `| ${result.runtime} | ${formatMedian(result)} | ${(result.coefficientOfVariation * 100).toFixed(1)}% | ${result.samples.length} | ${formatOps(result.median)} | ${(result.median / direct).toFixed(2)}× | ${(result.median / hullaApi).toFixed(2)}× | ${formatComparison(result)} |`
        )
      }
    }
  }
}

export function printPackageSizes(results: readonly PackageSizeResult[]): void {
  for (const line of bundleFootprintLines(results)) console.log(line)
}

function bundleFootprintLines(results: readonly PackageSizeResult[]): readonly string[] {
  const packages = results.filter(({ comparison }) => comparison === 'executable')
  const treeShaking = results.filter(({ comparison }) => comparison === 'breakdown')
  const baseline = packages.find(({ runtime }) => runtime.startsWith('@hulla/api'))
  if (baseline === undefined) return []
  return [
    '',
    '## Bundle footprint',
    '',
    'Production consumer bundles are minified for Bun with Zod externalized because it is a user-supplied schema library. Gzip uses level 9.',
    '',
    '### Executable package comparison',
    '',
    'Each row builds a representative one-route schema/contract, client, server execution path, and in-memory Fetch transport using that package’s normal guarantees. These are the comparable package results.',
    '',
    '| Package | Imports | Minified | vs @hulla/api | Gzip | vs @hulla/api |',
    '|---|---|---:|---:|---:|---:|',
    ...packages.map(
      (result) =>
        `| ${result.runtime} | ${result.imports} | ${formatBytes(result.minifiedBytes)} | ${formatRatio(result.minifiedBytes, baseline.minifiedBytes)} | ${formatBytes(result.gzipBytes)} | ${formatRatio(result.gzipBytes, baseline.gzipBytes)} |`
    ),
    '',
    '### @hulla/api tree-shaking checks',
    '',
    'Each row is an independent consumer entry point, not an additive component breakdown. “Retained” is relative to the complete @hulla/api Fetch client-and-server scenario above.',
    '',
    '| Retained usage | Imports | Minified | Minified share | Gzip | Gzip share |',
    '|---|---|---:|---:|---:|---:|',
    `| Full Fetch client + server | ${baseline.imports} | ${formatBytes(baseline.minifiedBytes)} | 100.0% | ${formatBytes(baseline.gzipBytes)} | 100.0% |`,
    ...treeShaking.map(
      (result) =>
        `| ${result.runtime} | ${result.imports} | ${formatBytes(result.minifiedBytes)} | ${formatShare(result.minifiedBytes, baseline.minifiedBytes)} | ${formatBytes(result.gzipBytes)} | ${formatShare(result.gzipBytes, baseline.gzipBytes)} |`
    ),
  ]
}

function runtimeLabel(): string {
  return process.versions['bun'] === undefined ? `Node ${process.version}` : `Bun ${process.versions['bun']}`
}

export async function writeBenchmarkReport(
  results: readonly BenchmarkResult[],
  packageSizes: readonly PackageSizeResult[],
  options: BenchmarkOptions,
  path: string,
  history: {
    readonly compatibleRuns: number
    readonly currentLabel: string
    readonly path: string
    readonly previousLabel?: string
  },
  adapterCohorts: readonly IndependentAdapterCohortResult[] = []
): Promise<void> {
  const generatedAt = new Date().toISOString()
  const measuredAdapters = (
    [
      'fetch',
      'express',
      'fastify',
      'h3',
      'hono',
      'cloudflare',
      'next',
      'tanstack-start',
      'solid-start',
      'sveltekit',
    ] as const
  ).filter((adapter) => results.some((result) => result.adapter === adapter))
  const lines = [
    '# Runtime benchmark report',
    '',
    '| Metadata | Value |',
    '|---|---|',
    `| Generated | ${generatedAt} |`,
    `| Source | ${history.currentLabel} |`,
    `| Runtime | ${runtimeLabel()} |`,
    `| Aggregate | ${history.compatibleRuns} compatible repeated ${history.compatibleRuns === 1 ? 'run' : 'runs'}; ${results[0]?.samples.length ?? 0} samples |`,
    `| Current invocation | ${options.runs} runs × ${options.samples} samples; at least ${options.minSampleTimeMs} ms per sample; default batches of ${options.iterations.toLocaleString('en-US')} iterations and ${options.warmup.toLocaleString('en-US')} warmup iterations |`,
    `| Raw history | ${history.path.replaceAll('|', '\\|')} |`,
    ...(history.previousLabel === undefined ? [] : [`| Compared with | ${history.previousLabel} |`]),
    '',
    '## Contents',
    '',
    '- [How to read the report](#how-to-read-the-report)',
    '- [Cross-package overview](#cross-package-overview)',
    ...(adapterCohorts.length === 0 ? [] : ['- [Framework adapter overview](#framework-adapter-overview)']),
    ...measuredAdapters.map(
      (adapter) => `- [${adapterTitle(adapter)} adapter results](#${adapter.replaceAll('.', '')}-adapter)`
    ),
    '- [Independent adapter cohorts](adapters-latest.md)',
    '- [Bundle footprint](#bundle-footprint)',
    '',
    '## How to read the report',
    '',
    '- `Median [95% CI]` is median batch-average operation cost, not individual-request latency. Sequential ops/sec is its reciprocal, not loaded throughput.',
    '- `vs direct` and `vs @hulla/api` compare medians only within the same operation and host adapter.',
    ...(history.previousLabel === undefined
      ? []
      : [
          '- `Change from previous` is a deterministic 95% run-level bootstrap interval. Negative values are faster; positive values are slower. Non-direct rows are normalized by matching direct-baseline drift.',
        ]),
    '- Aggregate rows use geometric means and require every operation in that cohort; missing coverage is shown as an em dash.',
    '- Native-protocol cohorts compare equivalent work through each package’s own protocol, not identical URL shapes or validation guarantees.',
    ...aggregateResultLines(results),
    ...independentAdapterSummaryLines(adapterCohorts),
    ...detailedResultLines(results),
  ]

  lines.push(...bundleFootprintLines(packageSizes))

  await mkdir(dirname(path), { recursive: true })
  await writeFile(path, `${lines.join('\n')}\n`, 'utf8')
}

type BenchmarkSnapshot = {
  readonly schemaVersion: 2
  readonly methodologyVersion: number
  readonly identity: BenchmarkIdentity
  readonly generatedAt: string
  readonly source: {
    readonly fingerprint: string
    readonly label: string
    readonly previousLabel?: string
    readonly revision: SourceRevision
  }
  readonly environment: BenchmarkEnvironment
  readonly configuration: BenchmarkOptions
  readonly history: {
    readonly compatibleRuns: number
    readonly path: string
    readonly totalRuns: number
  }
  readonly results: readonly {
    readonly adapter: BenchmarkAdapter
    readonly coefficientOfVariation: number
    readonly rawComparison?: BenchmarkComparison
    readonly comparison?: BenchmarkComparison
    readonly confidenceInterval95: readonly [number, number]
    readonly functionality: BenchmarkFunctionality
    readonly implementation: BenchmarkImplementation
    readonly iterationsPerBatch: number
    readonly maxNs: number
    readonly meanNs: number
    readonly medianNs: number
    readonly minNs: number
    readonly phase: BenchmarkPhase
    readonly previousMedianNs?: number
    readonly profile: BenchmarkProfile
    readonly protocol: BenchmarkProtocol
    readonly runCount: number
    readonly runtime: string
    readonly runtimeKey: string
    readonly processIds: readonly number[]
    readonly sampleGroupsNs: readonly (readonly number[])[]
    readonly sampleCount: number
    readonly scenario: BenchmarkScenario
    readonly standardDeviationNs: number
    readonly suite: BenchmarkSuite
    readonly warmupIterations: number
  }[]
  readonly bundleSizes: readonly PackageSizeResult[]
}

export async function writeBenchmarkSnapshot(
  results: readonly BenchmarkResult[],
  packageSizes: readonly PackageSizeResult[],
  options: BenchmarkOptions,
  path: string,
  history: {
    readonly compatibleRuns: number
    readonly currentLabel: string
    readonly environment: BenchmarkEnvironment
    readonly fingerprint: string
    readonly path: string
    readonly previousLabel?: string
    readonly source: SourceRevision
    readonly totalRuns: number
    readonly identity: BenchmarkIdentity
  }
): Promise<void> {
  const ordered = [...results].sort((left, right) => {
    const leftKey = [left.suite, left.adapter, left.phase, left.functionality, left.profile, left.implementation].join(
      '\0'
    )
    const rightKey = [
      right.suite,
      right.adapter,
      right.phase,
      right.functionality,
      right.profile,
      right.implementation,
    ].join('\0')
    return leftKey.localeCompare(rightKey)
  })
  const snapshot: BenchmarkSnapshot = {
    schemaVersion: 2,
    methodologyVersion: METHODOLOGY_VERSION,
    identity: history.identity,
    generatedAt: new Date().toISOString(),
    source: {
      fingerprint: history.fingerprint,
      label: history.currentLabel,
      ...(history.previousLabel === undefined ? {} : { previousLabel: history.previousLabel }),
      revision: history.source,
    },
    environment: history.environment,
    configuration: options,
    history: { compatibleRuns: history.compatibleRuns, path: history.path, totalRuns: history.totalRuns },
    results: ordered.map((result) => ({
      adapter: result.adapter,
      coefficientOfVariation: result.coefficientOfVariation,
      ...(result.comparison === undefined ? {} : { comparison: result.comparison }),
      ...(result.rawComparison === undefined ? {} : { rawComparison: result.rawComparison }),
      confidenceInterval95: [result.confidenceLow, result.confidenceHigh],
      functionality: result.functionality,
      implementation: result.implementation,
      iterationsPerBatch: result.iterations,
      maxNs: result.max,
      meanNs: result.mean,
      medianNs: result.median,
      minNs: result.min,
      phase: result.phase,
      ...(result.previousMedian === undefined ? {} : { previousMedianNs: result.previousMedian }),
      profile: result.profile,
      protocol: result.protocol,
      runCount: result.runs,
      runtime: result.runtime,
      runtimeKey: result.runtimeKey,
      processIds: result.processIds ?? (result.processId === undefined ? [] : [result.processId]),
      sampleGroupsNs: result.sampleGroups ?? [result.samples],
      sampleCount: result.samples.length,
      scenario: result.scenario,
      standardDeviationNs: result.standardDeviation,
      suite: result.suite,
      warmupIterations: result.warmup,
    })),
    bundleSizes: [...packageSizes].sort((left, right) => left.runtime.localeCompare(right.runtime)),
  }
  await mkdir(dirname(path), { recursive: true })
  await writeFile(path, `${JSON.stringify(snapshot, undefined, 2)}\n`, 'utf8')
}
