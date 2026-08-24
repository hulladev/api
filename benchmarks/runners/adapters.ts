import { spawnSync } from 'node:child_process'
import { mkdir, writeFile } from 'node:fs/promises'
import { fileURLToPath } from 'node:url'
import { adapterCohorts, type AdapterCohort } from '../adapters/cohorts'
import { benchmarkOptions, printResults, updateBenchmarkReportAdapterSummary, type BenchmarkResult } from '../harness'

const entry = fileURLToPath(new URL('./adapter-cohort.ts', import.meta.url))
const options = benchmarkOptions()
const completed: { readonly cohort: AdapterCohort; readonly results: readonly BenchmarkResult[] }[] = []

for (const cohort of adapterCohorts) {
  const label = `${cohort.adapter} / @hulla/api vs ${cohort.competitor}`
  const result = spawnSync(process.execPath, [entry], {
    encoding: 'utf8',
    env: {
      ...process.env,
      BENCH_ADAPTER: cohort.adapter,
      BENCH_COMPETITOR: cohort.competitor,
    },
    timeout: 300_000,
  })
  if (result.status !== 0) {
    throw new Error(`Adapter cohort failed: ${label}\n${result.stdout}\n${result.stderr}`)
  }
  const results = JSON.parse(result.stdout) as BenchmarkResult[]
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
  `${JSON.stringify({ schemaVersion: 1, generatedAt, configuration: options, cohorts: completed }, undefined, 2)}\n`,
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
    report.push('', `### ${scenario}`, '', '| Runtime | Median | vs direct | vs @hulla/api |', '|---|---:|---:|---:|')
    for (const result of selected) {
      report.push(
        `| ${result.runtime} | ${(result.median / 1_000).toFixed(2)} µs | ${direct === undefined ? '—' : `${(result.median / direct.median).toFixed(2)}×`} | ${hulla === undefined ? '—' : `${(result.median / hulla.median).toFixed(2)}×`} |`
      )
    }
  }
}
await writeFile(reportPath, `${report.join('\n')}\n`, 'utf8')

const mainReportPath = process.env['BENCH_REPORT'] ?? new URL('../results/latest.md', import.meta.url).pathname
const updatedMainReport = await updateBenchmarkReportAdapterSummary(mainReportPath, completed)

console.log('\nEach table ran in a fresh process with its own direct and @hulla/api baselines.')
console.log(`Independent adapter JSON: ${jsonPath.pathname}`)
console.log(`Independent adapter report: ${reportPath.pathname}`)
if (updatedMainReport) console.log(`Framework adapter overview: ${mainReportPath}`)
