import { mkdir, writeFile } from 'node:fs/promises'
import { dirname } from 'node:path'
import { benchmarkScenarios, type BenchmarkScenario } from './scenario'

/** One complete in-memory client-to-server round trip. */
export type Benchmark = {
  readonly profile?: BenchmarkProfile
  readonly runtime: string
  /** Stable implementation identity used across package-version labels. */
  readonly runtimeKey?: string
  readonly scenario: BenchmarkScenario
  readonly run: () => Promise<void>
}

export type BenchmarkProfile = 'focused' | 'native' | 'strict-parity'

const benchmarkProfiles: Readonly<Record<BenchmarkProfile, { readonly description: string; readonly title: string }>> =
  Object.freeze({
    'strict-parity': {
      title: 'Validated round trips',
      description:
        'Each package validates requests and responses at the boundaries provided by its public model. Guarantees differ and are listed in the benchmark README.',
    },
    native: {
      title: 'Native validated paths',
      description:
        'Each package uses its simplest practical validated/recommended path. Runtime guarantees differ, so these results show idiomatic cost rather than equal-capability performance.',
    },
    focused: {
      title: 'Focused @hulla/api diagnostics',
      description:
        'These isolate @hulla/api feature costs against direct equivalents. They are implementation diagnostics, not cross-package rankings.',
    },
  })

export type BenchmarkOptions = {
  readonly iterations: number
  readonly samples: number
  readonly warmup: number
}

export type BenchmarkResult = {
  readonly coefficientOfVariation: number
  readonly max: number
  readonly mean: number
  readonly median: number
  readonly min: number
  readonly profile: BenchmarkProfile
  readonly previousMedian?: number
  readonly medianChange?: number
  readonly runs: number
  readonly runtime: string
  readonly runtimeKey: string
  readonly scenario: BenchmarkScenario
  readonly samples: readonly number[]
  readonly standardDeviation: number
}

export type PackageSizeResult = {
  readonly gzipBytes: number
  readonly minifiedBytes: number
  readonly runtime: string
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

function standardDeviation(values: readonly number[]): number {
  const average = values.reduce((total, value) => total + value, 0) / values.length
  return Math.sqrt(values.reduce((total, value) => total + (value - average) ** 2, 0) / values.length)
}

export function summarizeBenchmarkResult(
  profile: BenchmarkProfile,
  runtime: string,
  scenario: BenchmarkScenario,
  samples: readonly number[],
  runs = 1,
  runtimeKey = runtime
): BenchmarkResult {
  const mean = samples.reduce((total, value) => total + value, 0) / samples.length
  const deviation = standardDeviation(samples)
  return {
    coefficientOfVariation: mean === 0 ? 0 : deviation / mean,
    max: Math.max(...samples),
    mean,
    median: median(samples),
    min: Math.min(...samples),
    profile,
    runs,
    runtime,
    runtimeKey,
    samples: Object.freeze([...samples]),
    scenario,
    standardDeviation: deviation,
  }
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

export async function runBenchmarks(
  benchmarks: readonly Benchmark[],
  options: BenchmarkOptions
): Promise<readonly BenchmarkResult[]> {
  for (const benchmark of benchmarks) {
    for (let iteration = 0; iteration < options.warmup; iteration++) await benchmark.run()
  }

  const measurements = new Map<string, number[]>()
  const profile = (benchmark: Benchmark): BenchmarkProfile => benchmark.profile ?? 'strict-parity'
  const runtimeKey = (benchmark: Benchmark): string => benchmark.runtimeKey ?? benchmark.runtime
  const key = (benchmark: Benchmark) => `${profile(benchmark)}\0${benchmark.scenario}\0${runtimeKey(benchmark)}`
  for (const benchmark of benchmarks) measurements.set(key(benchmark), [])

  for (let sample = 0; sample < options.samples; sample++) {
    const rotated = [
      ...benchmarks.slice(sample % benchmarks.length),
      ...benchmarks.slice(0, sample % benchmarks.length),
    ]
    for (const benchmark of rotated) {
      const start = performance.now()
      for (let iteration = 0; iteration < options.iterations; iteration++) await benchmark.run()
      measurements.get(key(benchmark))!.push(((performance.now() - start) * 1_000_000) / options.iterations)
    }
  }

  return benchmarks.map((benchmark) =>
    summarizeBenchmarkResult(
      profile(benchmark),
      benchmark.runtime,
      benchmark.scenario,
      measurements.get(key(benchmark))!,
      1,
      runtimeKey(benchmark)
    )
  )
}

export function printResults(
  results: readonly BenchmarkResult[],
  options: BenchmarkOptions,
  compatibleRuns = 1,
  previousLabel?: string
): void {
  console.log(
    `${runtimeLabel()} · ${compatibleRuns} compatible ${compatibleRuns === 1 ? 'run' : 'runs'} · ${options.iterations.toLocaleString('en-US')} iterations per sample`
  )
  if (previousLabel !== undefined) {
    console.log(`Previous revision: ${previousLabel}`)
    console.log('Median change: negative is faster; positive is slower.')
  }
  for (const selectedProfile of ['strict-parity', 'native', 'focused'] as const) {
    const profile = benchmarkProfiles[selectedProfile]
    console.log(`\n${profile.title}`)
    console.log(profile.description)
    for (const [scenario, description] of Object.entries(benchmarkScenarios)) {
      const scenarioResults = results.filter(
        (result) => result.profile === selectedProfile && result.scenario === scenario
      )
      const direct = scenarioResults.find(({ runtimeKey }) => runtimeKey.startsWith('Direct Fetch'))?.median
      const hullaApi = scenarioResults.find(({ runtimeKey }) => runtimeKey.startsWith('@hulla/api'))?.median
      if (scenarioResults.length === 0 || direct === undefined || hullaApi === undefined) continue
      console.log(`\n${description}`)
      console.log('| Runtime | Median | Mean | CV | Samples | Ops/sec | vs direct | vs @hulla/api | vs previous |')
      console.log('|---|---:|---:|---:|---:|---:|---:|---:|---:|')
      for (const result of scenarioResults) {
        console.log(
          `| ${result.runtime} | ${formatMicroseconds(result.median)} µs | ${formatMicroseconds(result.mean)} µs | ${(result.coefficientOfVariation * 100).toFixed(1)}% | ${result.samples.length} | ${formatOps(result.median)} | ${(result.median / direct).toFixed(2)}× | ${(result.median / hullaApi).toFixed(2)}× | ${result.medianChange === undefined ? '—' : `${result.medianChange >= 0 ? '+' : ''}${(result.medianChange * 100).toFixed(1)}%`} |`
        )
      }
    }
  }
}

export function printPackageSizes(results: readonly PackageSizeResult[]): void {
  console.log('\nBundle footprint (Zod external)')
  console.log('| Runtime | Minified | Gzip |')
  console.log('|---|---:|---:|')
  for (const result of results) {
    console.log(`| ${result.runtime} | ${formatBytes(result.minifiedBytes)} | ${formatBytes(result.gzipBytes)} |`)
  }
}

export function runtimeLabel(): string {
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
  }
): Promise<void> {
  const lines = [
    '# Runtime benchmark report',
    '',
    '| Metadata | Value |',
    '|---|---|',
    `| Generated | ${new Date().toISOString()} |`,
    `| Source | ${history.currentLabel} |`,
    `| Runtime | ${runtimeLabel()} |`,
    `| Aggregate | ${history.compatibleRuns} compatible ${history.compatibleRuns === 1 ? 'run' : 'runs'} |`,
    `| Current run | ${options.samples} ${options.samples === 1 ? 'sample' : 'samples'} × ${options.iterations.toLocaleString('en-US')} ${options.iterations === 1 ? 'iteration' : 'iterations'}; ${options.warmup.toLocaleString('en-US')} warmup ${options.warmup === 1 ? 'iteration' : 'iterations'} |`,
    `| Raw history | ${history.path.replaceAll('|', '\\|')} |`,
    ...(history.previousLabel === undefined ? [] : [`| Compared with | ${history.previousLabel} |`]),
    ...(history.previousLabel === undefined
      ? ['']
      : ['', 'Median changes compare with that revision; negative is faster and positive is slower.', '']),
    'The strict-parity profile is the primary feature-parity comparison. Native results show each package’s idiomatic validated path with its documented differences in guarantees. Focused diagnostics compare @hulla/api internals with direct equivalents and are not cross-package rankings.',
  ]

  for (const selectedProfile of ['strict-parity', 'native', 'focused'] as const) {
    const profile = benchmarkProfiles[selectedProfile]
    lines.push('', `## ${profile.title}`, '', profile.description)
    for (const [scenario, description] of Object.entries(benchmarkScenarios)) {
      const scenarioResults = results.filter(
        (result) => result.profile === selectedProfile && result.scenario === scenario
      )
      const direct = scenarioResults.find(({ runtimeKey }) => runtimeKey.startsWith('Direct Fetch'))?.median
      const hullaApi = scenarioResults.find(({ runtimeKey }) => runtimeKey.startsWith('@hulla/api'))?.median
      if (scenarioResults.length === 0 || direct === undefined || hullaApi === undefined) continue
      lines.push(
        '',
        `### ${description}`,
        '',
        '| Runtime | Median | Mean | CV | Ops/sec | vs direct | vs @hulla/api | vs previous | Previous median | Min | Max | Std dev | Runs | Samples |',
        '|---|---:|---:|---:|---:|---:|---:|---:|---:|---:|---:|---:|---:|---:|'
      )
      for (const result of scenarioResults) {
        lines.push(
          `| ${result.runtime} | ${formatMicroseconds(result.median)} µs | ${formatMicroseconds(result.mean)} µs | ${(result.coefficientOfVariation * 100).toFixed(1)}% | ${formatOps(result.median)} | ${(result.median / direct).toFixed(2)}× | ${(result.median / hullaApi).toFixed(2)}× | ${result.medianChange === undefined ? '—' : `${result.medianChange >= 0 ? '+' : ''}${(result.medianChange * 100).toFixed(1)}%`} | ${result.previousMedian === undefined ? '—' : `${formatMicroseconds(result.previousMedian)} µs`} | ${formatMicroseconds(result.min)} µs | ${formatMicroseconds(result.max)} µs | ${formatMicroseconds(result.standardDeviation)} µs | ${result.runs} | ${result.samples.length} |`
        )
      }
    }
  }

  lines.push(
    '',
    '## Bundle footprint',
    '',
    'Production bundles are minified for Bun with Zod externalized because it is a user-supplied schema library. Gzip uses level 9.',
    '',
    '| Runtime | Minified | Gzip |',
    '|---|---:|---:|',
    ...packageSizes.map(
      (result) => `| ${result.runtime} | ${formatBytes(result.minifiedBytes)} | ${formatBytes(result.gzipBytes)} |`
    )
  )

  await mkdir(dirname(path), { recursive: true })
  await writeFile(path, `${lines.join('\n')}\n`, 'utf8')
}
