import { readFile } from 'node:fs/promises'
import { directFetchBenchmark } from './direct-fetch'
import { benchmarkOptions, printResults, runBenchmarks, type Benchmark } from './harness'
import { honoBenchmark } from './hono'
import { hullaBenchmark } from './hulla'
import { orpcBenchmark } from './orpc'
import { trpcBenchmark } from './trpc'
import { tsRestBenchmark } from './ts-rest'

async function packageVersion(path: string): Promise<string> {
  const contents = JSON.parse(await readFile(new URL(path, import.meta.url), 'utf8')) as { version?: unknown }
  if (typeof contents.version !== 'string') throw new TypeError(`Missing package version in ${path}`)
  return contents.version
}

async function versioned(benchmark: Benchmark, packagePath: string): Promise<Benchmark> {
  return { ...benchmark, name: `${benchmark.name} ${await packageVersion(packagePath)}` }
}

const options = benchmarkOptions()
const benchmarks = [
  directFetchBenchmark,
  await versioned(hullaBenchmark, './node_modules/@hulla/api/package.json'),
  await versioned(trpcBenchmark, './node_modules/@trpc/server/package.json'),
  await versioned(orpcBenchmark, './node_modules/@orpc/server/package.json'),
  await versioned(tsRestBenchmark, './node_modules/@ts-rest/core/package.json'),
  await versioned(honoBenchmark, './node_modules/hono/package.json'),
]
const results = await runBenchmarks(benchmarks, options)

printResults(results, options)
