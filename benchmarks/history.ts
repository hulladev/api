import { execFileSync } from 'node:child_process'
import { createHash } from 'node:crypto'
import { appendFile, mkdir, readFile, readdir } from 'node:fs/promises'
import { arch, cpus, hostname, platform, release } from 'node:os'
import { dirname, relative, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'
import {
  runtimeLabel,
  summarizeBenchmarkResult,
  type BenchmarkOptions,
  type BenchmarkProfile,
  type BenchmarkResult,
} from './harness'
import { benchmarkScenarios, type BenchmarkScenario } from './scenario'

type StoredResult = {
  readonly profile: BenchmarkProfile
  readonly runtime: string
  readonly runtimeKey?: string
  readonly samples: readonly number[]
  readonly scenario: BenchmarkScenario
}

type SourceRevision = {
  readonly commit: string
  readonly dirty: boolean
  readonly packageVersion: string
}

type BenchmarkEnvironment = {
  readonly architecture: string
  readonly cpu: string
  readonly host: string
  readonly osRelease: string
  readonly platform: string
  readonly runtime: string
}

type HistoryRecord = {
  readonly environment: BenchmarkEnvironment
  readonly fingerprint: string
  readonly iterations: number
  readonly results: readonly StoredResult[]
  readonly source?: SourceRevision
  readonly timestamp: string
  readonly version: 1
  readonly warmup: number
}

export type BenchmarkHistory = {
  readonly compatibleRuns: number
  readonly currentLabel: string
  readonly path: string
  readonly previousLabel?: string
  readonly results: readonly BenchmarkResult[]
  readonly totalRuns: number
}

const benchmarkDirectory = dirname(fileURLToPath(import.meta.url))
const repositoryDirectory = resolve(benchmarkDirectory, '..')
const corePackagePath = resolve(repositoryDirectory, 'packages/core/package.json')
const fingerprintPaths = [
  resolve(repositoryDirectory, 'packages/core/src'),
  resolve(repositoryDirectory, 'packages/core/package.json'),
  resolve(repositoryDirectory, 'packages/zod/src'),
  resolve(repositoryDirectory, 'packages/zod/package.json'),
  benchmarkDirectory,
  resolve(benchmarkDirectory, 'package.json'),
  resolve(repositoryDirectory, 'bun.lock'),
  resolve(repositoryDirectory, 'package.json'),
]

async function sourceFiles(path: string): Promise<readonly string[]> {
  const entries = await readdir(path, { withFileTypes: true })
  const files: string[] = []
  for (const entry of entries) {
    if (entry.name === 'node_modules' || entry.name === 'results' || entry.name.startsWith('.')) continue
    const child = resolve(path, entry.name)
    if (entry.isDirectory()) files.push(...(await sourceFiles(child)))
    else if (entry.isFile() && (entry.name.endsWith('.ts') || entry.name === 'package.json')) files.push(child)
  }
  return files
}

async function sourceFingerprint(): Promise<string> {
  const hash = createHash('sha256')
  const files: string[] = []
  for (const path of fingerprintPaths) {
    const entries = await readdir(path).catch(() => undefined)
    if (entries === undefined) files.push(path)
    else files.push(...(await sourceFiles(path)))
  }

  for (const path of files.sort()) {
    hash.update(relative(repositoryDirectory, path))
    hash.update('\0')
    hash.update(await readFile(path, 'utf8'))
    hash.update('\0')
  }
  return hash.digest('hex')
}

function environment(): BenchmarkEnvironment {
  return {
    architecture: arch(),
    cpu: cpus()[0]?.model ?? 'unknown',
    host: hostname(),
    osRelease: release(),
    platform: platform(),
    runtime: runtimeLabel(),
  }
}

function gitOutput(arguments_: readonly string[]): string | undefined {
  try {
    return execFileSync('git', arguments_, { cwd: repositoryDirectory, encoding: 'utf8' }).trim()
  } catch {
    return undefined
  }
}

async function sourceRevision(): Promise<SourceRevision> {
  const packageValue = JSON.parse(await readFile(corePackagePath, 'utf8')) as { version?: unknown }
  if (typeof packageValue.version !== 'string') throw new TypeError('Missing @hulla/api package version')
  const status = gitOutput([
    'status',
    '--short',
    '--untracked-files=all',
    '--',
    'packages/core',
    'packages/zod',
    'benchmarks',
    'bun.lock',
    'package.json',
  ])
  return {
    commit: gitOutput(['rev-parse', 'HEAD']) ?? 'unavailable',
    dirty: status !== undefined && status !== '',
    packageVersion: packageValue.version,
  }
}

function storedResult(value: unknown): value is StoredResult {
  if (typeof value !== 'object' || value === null) return false
  const result = value as Partial<StoredResult>
  return (
    typeof result.profile === 'string' &&
    typeof result.runtime === 'string' &&
    (result.runtimeKey === undefined || typeof result.runtimeKey === 'string') &&
    typeof result.scenario === 'string' &&
    result.scenario in benchmarkScenarios &&
    Array.isArray(result.samples) &&
    result.samples.every((sample) => typeof sample === 'number' && Number.isFinite(sample))
  )
}

function storedSource(value: unknown): value is SourceRevision {
  if (typeof value !== 'object' || value === null) return false
  const source = value as Partial<SourceRevision>
  return (
    typeof source.commit === 'string' && typeof source.dirty === 'boolean' && typeof source.packageVersion === 'string'
  )
}

function storedEnvironment(value: unknown): value is BenchmarkEnvironment {
  if (typeof value !== 'object' || value === null) return false
  const environment = value as Partial<BenchmarkEnvironment>
  return (
    typeof environment.architecture === 'string' &&
    typeof environment.cpu === 'string' &&
    typeof environment.host === 'string' &&
    typeof environment.osRelease === 'string' &&
    typeof environment.platform === 'string' &&
    typeof environment.runtime === 'string'
  )
}

function historyRecord(value: unknown): value is HistoryRecord {
  if (typeof value !== 'object' || value === null) return false
  const record = value as Partial<HistoryRecord>
  return (
    record.version === 1 &&
    typeof record.fingerprint === 'string' &&
    typeof record.iterations === 'number' &&
    typeof record.warmup === 'number' &&
    storedEnvironment(record.environment) &&
    Array.isArray(record.results) &&
    record.results.every(storedResult) &&
    (record.source === undefined || storedSource(record.source))
  )
}

async function readHistory(path: string): Promise<readonly HistoryRecord[]> {
  let contents: string
  try {
    contents = await readFile(path, 'utf8')
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === 'ENOENT') return []
    throw error
  }

  const records: HistoryRecord[] = []
  for (const [index, line] of contents.split('\n').entries()) {
    if (line.trim() === '') continue
    let value: unknown
    try {
      value = JSON.parse(line)
    } catch {
      console.warn(`Ignoring malformed benchmark history at ${path}:${index + 1}`)
      continue
    }
    if (historyRecord(value)) records.push(value)
    else console.warn(`Ignoring incompatible benchmark history at ${path}:${index + 1}`)
  }
  return records
}

function sameEnvironment(left: BenchmarkEnvironment, right: BenchmarkEnvironment): boolean {
  return (
    left.architecture === right.architecture &&
    left.cpu === right.cpu &&
    left.host === right.host &&
    left.osRelease === right.osRelease &&
    left.platform === right.platform &&
    left.runtime === right.runtime
  )
}

function stableRuntimeKey(result: StoredResult): string {
  return result.runtimeKey ?? result.runtime.replace(/\s+\d+\.\d+\.\d+(?:-[0-9A-Za-z.-]+)?(?=\s|$)(?:\s+-)?/, '')
}

function resultKey(result: StoredResult): string {
  return `${result.profile}\0${result.scenario}\0${stableRuntimeKey(result)}`
}

function aggregateResults(
  current: readonly BenchmarkResult[],
  records: readonly HistoryRecord[]
): readonly BenchmarkResult[] {
  const collected = new Map<string, { runs: number; samples: number[] }>()
  for (const record of records) {
    for (const result of record.results) {
      const key = resultKey(result)
      const aggregate = collected.get(key)
      if (aggregate === undefined) collected.set(key, { runs: 1, samples: [...result.samples] })
      else {
        aggregate.runs += 1
        aggregate.samples.push(...result.samples)
      }
    }
  }

  return current.map((result) => {
    const aggregate = collected.get(resultKey(result))
    if (aggregate === undefined) return result
    return summarizeBenchmarkResult(
      result.profile,
      result.runtime,
      result.scenario,
      aggregate.samples,
      aggregate.runs,
      result.runtimeKey
    )
  })
}

function median(values: readonly number[]): number {
  const sorted = [...values].sort((left, right) => left - right)
  const middle = Math.floor(sorted.length / 2)
  if (sorted.length % 2 === 1) return sorted[middle]!
  return (sorted[middle - 1]! + sorted[middle]!) / 2
}

function previousMedians(records: readonly HistoryRecord[]): ReadonlyMap<string, number> {
  const samples = new Map<string, number[]>()
  for (const record of records) {
    for (const result of record.results) {
      const key = resultKey(result)
      const values = samples.get(key)
      if (values === undefined) samples.set(key, [...result.samples])
      else values.push(...result.samples)
    }
  }
  return new Map([...samples].map(([key, values]) => [key, median(values)]))
}

function revisionLabel(record: HistoryRecord): string {
  const source = record.source
  if (source === undefined) return `source ${record.fingerprint.slice(0, 8)}`
  const commit = source.commit === 'unavailable' ? record.fingerprint.slice(0, 8) : source.commit.slice(0, 8)
  const local = source.dirty ? ` + local ${record.fingerprint.slice(0, 8)}` : ''
  return `@hulla/api ${source.packageVersion} · ${commit}${local}`
}

export async function persistBenchmarkHistory(
  results: readonly BenchmarkResult[],
  options: BenchmarkOptions,
  path: string
): Promise<BenchmarkHistory> {
  const currentEnvironment = environment()
  const fingerprint = await sourceFingerprint()
  const source = await sourceRevision()
  const record: HistoryRecord = {
    environment: currentEnvironment,
    fingerprint,
    iterations: options.iterations,
    results: results.map(({ profile, runtime, runtimeKey, samples, scenario }) => ({
      profile,
      runtime,
      runtimeKey,
      samples,
      scenario,
    })),
    source,
    timestamp: new Date().toISOString(),
    version: 1,
    warmup: options.warmup,
  }
  const stored = await readHistory(path)
  await mkdir(dirname(path), { recursive: true })
  await appendFile(path, `${JSON.stringify(record)}\n`, 'utf8')

  const records = [...stored, record]
  const comparable = records.filter(
    (candidate) =>
      candidate.iterations === options.iterations &&
      candidate.warmup === options.warmup &&
      sameEnvironment(candidate.environment, currentEnvironment)
  )
  const compatible = comparable.filter((candidate) => candidate.fingerprint === fingerprint)
  const previousRecord = [...comparable].reverse().find((candidate) => candidate.fingerprint !== fingerprint)
  const previous =
    previousRecord === undefined
      ? undefined
      : comparable.filter((candidate) => candidate.fingerprint === previousRecord.fingerprint)
  const medians = previous === undefined ? undefined : previousMedians(previous)
  const aggregated = aggregateResults(results, compatible).map((result) => {
    const previousMedian = medians?.get(resultKey(result))
    return previousMedian === undefined
      ? result
      : {
          ...result,
          medianChange: previousMedian === 0 ? 0 : result.median / previousMedian - 1,
          previousMedian,
        }
  })
  return {
    compatibleRuns: compatible.length,
    currentLabel: revisionLabel(record),
    path,
    ...(previousRecord === undefined ? {} : { previousLabel: revisionLabel(previousRecord) }),
    results: aggregated,
    totalRuns: records.length,
  }
}
