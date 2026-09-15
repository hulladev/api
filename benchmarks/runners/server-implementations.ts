import { benchmarkOptions, printResults, runBenchmarkRuns } from '../harness'
import { serverImplementationBenchmarks } from '../suites/server-implementations'

const options = benchmarkOptions()
const results = await runBenchmarkRuns(serverImplementationBenchmarks, options)
printResults(results, options, options.runs)
