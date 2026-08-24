import { adapterCohortBenchmarks, parseAdapterCohort } from '../adapters/cohorts'
import { benchmarkOptions, runBenchmarkRuns } from '../harness'

const cohort = parseAdapterCohort(process.env['BENCH_ADAPTER'], process.env['BENCH_COMPETITOR'])
const results = await runBenchmarkRuns(await adapterCohortBenchmarks(cohort), benchmarkOptions())
process.stdout.write(`${JSON.stringify(results)}\n`)
