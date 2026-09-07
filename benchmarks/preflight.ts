import assert from 'node:assert/strict'
import type { Benchmark } from './harness'
import { withExpectedValidationLogs } from './harness/preflight-output'

process.env['BENCH_PREFLIGHT'] = '1'
const { resetValidationCounts, validationCounts, rejectValidation } = await import('./fixtures/validation-observer')
const modules = await Promise.all([
  import('./direct-fetch'),
  import('./hulla-api'),
  import('./trpc'),
  import('./orpc'),
  import('./ts-rest'),
  import('./hono'),
])
const cases = modules.flatMap((module) => Object.values(module).filter(Array.isArray).flat()) as Benchmark[]
const verified: { runtime: string; profile: string; scenario: string; counts: Readonly<Record<string, number>> }[] = []
for (const benchmark of cases) {
  resetValidationCounts()
  await benchmark.run()
  const counts = validationCounts()
  const profile = benchmark.profile ?? 'strict-parity'
  const native = profile === 'native'
  const outputPasses = native
    ? benchmark.runtime.startsWith('@hulla/api')
      ? 2
      : benchmark.runtime.startsWith('Hono')
        ? 0
        : 1
    : 2
  const expected =
    benchmark.scenario === 'static-get'
      ? { healthOutput: outputPasses }
      : benchmark.scenario === 'small-json-post'
        ? { createUserInput: 1, createUserOutput: outputPasses }
        : benchmark.scenario === 'large-json-post'
          ? { largeInput: 1, largeOutput: outputPasses }
          : benchmark.scenario === 'path-parameter-read'
            ? { resourceParams: 1, resourceOutput: 2 }
            : benchmark.scenario === 'query-header-read'
              ? { organizationParams: 1, resourceQuery: 1, resourceHeaders: 1, collectionOutput: 2 }
              : { resourceParams: 1, updateQuery: 1, resourceHeaders: 1, updateBody: 1, resourceOutput: 2 }
  assert.deepEqual(
    counts,
    Object.fromEntries(Object.entries(expected).filter(([, value]) => value !== 0)),
    `${profile}/${benchmark.runtime}/${benchmark.scenario}: validation policy drift`
  )
  // A configured validator must be able to reject, not merely increment a counter.
  for (const name of Object.keys(expected)) {
    if (expected[name as keyof typeof expected] === 0) continue
    rejectValidation(name)
    try {
      await withExpectedValidationLogs(() =>
        assert.rejects(benchmark.run(), `${benchmark.runtime}/${benchmark.scenario} ignored ${name} failure`)
      )
    } finally {
      rejectValidation()
    }
  }
  verified.push({ runtime: benchmark.runtime, profile, scenario: benchmark.scenario, counts })
}
console.log(`Semantic and validation-policy preflight passed: ${verified.length} operations.`)

const diagnostics = await Promise.all([
  import('./cold-start'),
  import('./hulla-api-breakdown'),
  import('./route-scaling'),
  import('./suites/server-implementations'),
])
let focused = 0
for (const module of diagnostics)
  for (const value of Object.values(module))
    if (Array.isArray(value))
      for (const benchmark of value as Benchmark[]) {
        await benchmark.run()
        focused++
      }
console.log(`Focused fixture preflight passed: ${focused} operations.`)
