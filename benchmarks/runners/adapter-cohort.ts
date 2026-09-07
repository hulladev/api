import { adapterCohortBenchmarks, parseAdapterCohort } from '../adapters/cohorts'
import { benchmarkOptions, runBenchmarkRuns } from '../harness'
import { benchmarkIdentity } from '../harness/provenance'

const cohort = parseAdapterCohort(process.env['BENCH_ADAPTER'], process.env['BENCH_COMPETITOR'])
const results = await runBenchmarkRuns(await adapterCohortBenchmarks(cohort), benchmarkOptions())
process.stdout.write(`${JSON.stringify({ identity: await benchmarkIdentity(), results })}\n`)
