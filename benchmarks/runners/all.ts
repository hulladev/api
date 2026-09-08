import { spawnSync } from 'node:child_process'
import { randomUUID } from 'node:crypto'
import { rm } from 'node:fs/promises'
import { resolve } from 'node:path'
import { fileURLToPath } from 'node:url'
import { assertCompatibleIdentity, benchmarkIdentity } from '../harness/provenance'
import { createBenchmarkWorkspace } from '../harness/workspace'

const root = fileURLToPath(new URL('../../', import.meta.url))
const identity = await benchmarkIdentity()
const snapshot = await createBenchmarkWorkspace(root)
try {
  assertCompatibleIdentity(identity, await benchmarkIdentity(), 'snapshot creation')
  assertCompatibleIdentity(identity, await benchmarkIdentity(snapshot), 'snapshot verification')
  const git = (args: string[]) => spawnSync('git', args, { cwd: root, encoding: 'utf8' }).stdout?.trim()
  const env = {
    ...process.env,
    BENCH_RUN_ID: randomUUID(),
    BENCH_SOURCE_COMMIT: git(['rev-parse', 'HEAD']) || 'unavailable',
    BENCH_SOURCE_DIRTY: String(
      Boolean(git(['status', '--short', '--', 'packages', 'benchmarks', 'bun.lock', 'package.json']))
    ),
    BENCH_REPORT: resolve(process.env['BENCH_REPORT'] ?? resolve(root, 'benchmarks/results/latest.md')),
    BENCH_JSON: resolve(process.env['BENCH_JSON'] ?? resolve(root, 'benchmarks/results/latest.json')),
    BENCH_HISTORY: resolve(process.env['BENCH_HISTORY'] ?? resolve(root, 'benchmarks/results/history.ndjson')),
  }
  console.log('Running benchmarks against a private copy of built packages and fixtures.')
  for (const entry of [
    'preflight.ts',
    'package-size.ts',
    'fetch-roundtrip.ts',
    'runners/adapters.ts',
    'runners/diagnostics.ts',
  ]) {
    const result = spawnSync(process.execPath, [entry], { stdio: 'inherit', cwd: resolve(snapshot, 'benchmarks'), env })
    if (result.status !== 0) throw new Error(`${entry} failed (${result.status})`)
  }
  console.log(`Benchmark report: ${env.BENCH_REPORT}`)
} finally {
  await rm(snapshot, { recursive: true, force: true })
}
