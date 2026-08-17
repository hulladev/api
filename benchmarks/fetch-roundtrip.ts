import { readFile } from 'node:fs/promises'
import { coldStartBenchmarks } from './cold-start'
import { directFetchBenchmarks, directFetchNativeBenchmarks } from './direct-fetch'
import {
  benchmarkOptions,
  printPackageSizes,
  printResults,
  runBenchmarks,
  writeBenchmarkReport,
  type Benchmark,
  type PackageSizeResult,
} from './harness'
import { persistBenchmarkHistory } from './history'
import { honoBenchmarks, honoNativeBenchmarks } from './hono'
import { hullaApiBenchmarks, hullaApiNativeBenchmarks } from './hulla-api'
import { hullaApiBreakdownBenchmarks } from './hulla-api-breakdown'
import { orpcBenchmarks, orpcNativeBenchmarks } from './orpc'
import { routeScalingBenchmarks } from './route-scaling'
import { trpcBenchmarks, trpcNativeBenchmarks } from './trpc'
import { tsRestBenchmarks, tsRestNativeBenchmarks } from './ts-rest'

async function packageVersion(path: string): Promise<string> {
  const contents = JSON.parse(await readFile(new URL(path, import.meta.url), 'utf8')) as { version?: unknown }
  if (typeof contents.version !== 'string') throw new TypeError(`Missing package version in ${path}`)
  return contents.version
}

const options = benchmarkOptions()
const versions = new Map([
  ['@hulla/api', await packageVersion('./node_modules/@hulla/api/package.json')],
  ['tRPC', await packageVersion('./node_modules/@trpc/server/package.json')],
  ['oRPC', await packageVersion('./node_modules/@orpc/server/package.json')],
  ['ts-rest', await packageVersion('./node_modules/@ts-rest/core/package.json')],
  ['Hono RPC', await packageVersion('./node_modules/hono/package.json')],
])

function versionedRuntime(runtime: string): string {
  const runtimeName = [...versions.keys()].find((name) => runtime.startsWith(name))
  const version = runtimeName === undefined ? undefined : versions.get(runtimeName)
  if (runtimeName === undefined || version === undefined) return runtime
  const suffix = runtime.slice(runtimeName.length).trim()
  return suffix === '' ? `${runtimeName} ${version}` : `${runtimeName} ${version} - ${suffix}`
}

const packageSizes = (
  JSON.parse(await readFile(new URL('./results/package-size.json', import.meta.url), 'utf8')) as PackageSizeResult[]
).map((result) => ({ ...result, runtime: versionedRuntime(result.runtime) }))
const benchmarks: readonly Benchmark[] = [
  ...directFetchNativeBenchmarks,
  ...hullaApiNativeBenchmarks,
  ...trpcNativeBenchmarks,
  ...orpcNativeBenchmarks,
  ...tsRestNativeBenchmarks,
  ...honoNativeBenchmarks,
  ...directFetchBenchmarks,
  ...hullaApiBenchmarks,
  ...trpcBenchmarks,
  ...orpcBenchmarks,
  ...tsRestBenchmarks,
  ...honoBenchmarks,
  ...coldStartBenchmarks,
  ...hullaApiBreakdownBenchmarks,
  ...routeScalingBenchmarks,
].map((benchmark) => ({ ...benchmark, runtimeKey: benchmark.runtime, runtime: versionedRuntime(benchmark.runtime) }))
const results = await runBenchmarks(benchmarks, options)
const historyPath = process.env['BENCH_HISTORY'] ?? new URL('./results/history.ndjson', import.meta.url).pathname
const history = await persistBenchmarkHistory(results, options, historyPath)

printResults(history.results, options, history.compatibleRuns, history.previousLabel)
printPackageSizes(packageSizes)
const reportPath = process.env['BENCH_REPORT'] ?? new URL('./results/latest.md', import.meta.url).pathname
await writeBenchmarkReport(history.results, packageSizes, options, reportPath, history)
console.log(
  `\nBenchmark history: ${history.path} (${history.compatibleRuns} compatible, ${history.totalRuns} total runs)`
)
console.log(`\nDetailed report: ${reportPath}`)
