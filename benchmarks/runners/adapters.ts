import { spawnSync } from 'node:child_process'
import { mkdir, readFile, writeFile } from 'node:fs/promises'
import { fileURLToPath } from 'node:url'
import { adapterCohorts, type AdapterCohort } from '../adapters/cohorts'
import {
  benchmarkOptions,
  printResults,
  withSampleGroups,
  summarizeBenchmarkResult,
  updateBenchmarkReportAdapterSummary,
  type BenchmarkResult,
} from '../harness'
import {
  assertCompatibleIdentity,
  benchmarkIdentity,
  compatibleIdentity,
  type BenchmarkIdentity,
} from '../harness/provenance'

const entry = fileURLToPath(new URL('./adapter-cohort.ts', import.meta.url))
const options = benchmarkOptions()
const identity = await benchmarkIdentity()
const completed: { readonly cohort: AdapterCohort; readonly results: readonly BenchmarkResult[] }[] = []

for (const cohort of adapterCohorts) {
  const label = `${cohort.adapter} / @hulla/api vs ${cohort.competitor}`
  const runs: BenchmarkResult[][] = []
  for (let run = 0; run < options.runs; run++) {
    const result = spawnSync(process.execPath, [entry], {
      encoding: 'utf8',
      env: {
        ...process.env,
        BENCH_RUN_ID: identity.runId,
        BENCH_RUNS: '1',
        BENCH_ADAPTER: cohort.adapter,
        BENCH_COMPETITOR: cohort.competitor,
      },
      timeout: 300_000,
    })
    if (result.status !== 0) throw new Error(`Adapter cohort failed: ${label}\n${result.stdout}\n${result.stderr}`)
    const snapshot = JSON.parse(result.stdout) as { identity: BenchmarkIdentity; results: BenchmarkResult[] }
    assertCompatibleIdentity(identity, snapshot.identity, label)
    runs.push(snapshot.results)
  }
  const results = runs[0]!.map((result, index) => ({
    ...withSampleGroups(
      summarizeBenchmarkResult(
        result.profile,
        result.runtime,
        result.scenario,
        runs.flatMap((run) => run[index]!.samples),
        options.runs,
        result.runtimeKey,
        undefined,
        result.iterations,
        result.warmup
      ),
      runs.map((run) => run[index]!.samples)
    ),
    sampleGroups: runs.map((run) => run[index]!.samples),
    processIds: runs.flatMap((run) => (run[index]!.processId === undefined ? [] : [run[index]!.processId!])),
  }))
  completed.push({ cohort, results })
  console.log(`\n## ${label}`)
  printResults(results, options, options.runs)
}

const generatedAt = new Date().toISOString()
const resultsDirectory = new URL('../results/', import.meta.url)
const jsonPath = new URL('../results/adapters-latest.json', import.meta.url)
const reportPath = new URL('../results/adapters-latest.md', import.meta.url)
await mkdir(resultsDirectory, { recursive: true })
await writeFile(
  jsonPath,
  `${JSON.stringify({ schemaVersion: 2, identity, generatedAt, configuration: options, cohorts: completed }, undefined, 2)}\n`,
  'utf8'
)

const report = [
  '# Independent adapter benchmark report',
  '',
  `Generated: ${generatedAt}`,
  '',
  'Each cohort ran in a fresh process with its own direct and @hulla/api baselines. Medians are never compared across cohorts.',
]
for (const { cohort, results } of completed) {
  report.push('', `## ${cohort.adapter}: @hulla/api vs ${cohort.competitor}`)
  for (const scenario of [...new Set(results.map(({ scenario }) => scenario))]) {
    const selected = results.filter((result) => result.scenario === scenario)
    const direct = selected.find(({ implementation }) => implementation === 'direct')
    const hulla = selected.find(({ implementation }) => implementation === '@hulla/api')
    report.push(
      '',
      `### ${scenario}`,
      '',
      'The difference is each runtime’s median latency minus the @hulla/api median, expressed relative to @hulla/api; negative is faster.',
      '',
      '| Runtime | Median batch-average latency [95% run CI] | Median latency difference vs @hulla/api | Median latency ratio vs direct | Median latency ratio vs @hulla/api |',
      '|---|---:|---:|---:|---:|'
    )
    for (const result of selected) {
      const difference =
        hulla === undefined
          ? '—'
          : `${result.median >= hulla.median ? '+' : ''}${((result.median / hulla.median - 1) * 100).toFixed(1)}%`
      report.push(
        `| ${result.runtime} | ${(result.median / 1_000).toFixed(2)} [${(result.confidenceLow / 1_000).toFixed(2)}, ${(result.confidenceHigh / 1_000).toFixed(2)}] µs | ${difference} | ${direct === undefined ? '—' : `${(result.median / direct.median).toFixed(2)}×`} | ${hulla === undefined ? '—' : `${(result.median / hulla.median).toFixed(2)}×`} |`
      )
    }
  }
}
await writeFile(reportPath, `${report.join('\n')}\n`, 'utf8')

const mainReportPath = process.env['BENCH_REPORT'] ?? new URL('../results/latest.md', import.meta.url).pathname
let updatedMainReport = false
try {
  const mainSnapshot = JSON.parse(
    await readFile(process.env['BENCH_JSON'] ?? new URL('../results/latest.json', import.meta.url), 'utf8')
  ) as { identity?: BenchmarkIdentity }
  if (
    mainSnapshot.identity !== undefined &&
    mainSnapshot.identity.runId === identity.runId &&
    compatibleIdentity(identity, mainSnapshot.identity)
  ) {
    updatedMainReport = await updateBenchmarkReportAdapterSummary(mainReportPath, completed)
  }
} catch (error) {
  if ((error as NodeJS.ErrnoException).code !== 'ENOENT') throw error
}

console.log('\nEach table ran in a fresh process with its own direct and @hulla/api baselines.')
console.log(`Independent adapter JSON: ${jsonPath.pathname}`)
console.log(`Independent adapter report: ${reportPath.pathname}`)
if (updatedMainReport) console.log(`Framework adapter overview: ${mainReportPath}`)
