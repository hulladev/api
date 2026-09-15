import { adapterCohortBenchmarks, parseAdapterCohort } from '../adapters/cohorts'
import { benchmarkOptions, runBenchmarkRuns } from '../harness'
import { assertCompatibleIdentity, benchmarkIdentity } from '../harness/provenance'

const cohort = parseAdapterCohort(process.env['BENCH_ADAPTER'], process.env['BENCH_COMPETITOR'])
const identity = await benchmarkIdentity()
const results = await runBenchmarkRuns(await adapterCohortBenchmarks(cohort), benchmarkOptions())
assertCompatibleIdentity(identity, await benchmarkIdentity(), `${cohort.adapter} / ${cohort.competitor}`)
process.stdout.write(`${JSON.stringify({ identity, results })}\n`)
