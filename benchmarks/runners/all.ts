import { spawnSync } from 'node:child_process'
import { randomUUID } from 'node:crypto'
const env = { ...process.env, BENCH_RUN_ID: randomUUID() }
for (const entry of [
  'preflight.ts',
  'package-size.ts',
  'fetch-roundtrip.ts',
  'runners/adapters.ts',
  'runners/diagnostics.ts',
]) {
  const result = spawnSync(process.execPath, [entry], { stdio: 'inherit', cwd: new URL('..', import.meta.url), env })
  if (result.status !== 0) throw new Error(`${entry} failed (${result.status})`)
}
