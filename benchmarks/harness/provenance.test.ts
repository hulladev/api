import { describe, expect, test } from 'vitest'
import { resultKey } from './history'
import { compatibleIdentity, type BenchmarkIdentity } from './provenance'

const identity: BenchmarkIdentity = {
  runId: 'first',
  methodologyVersion: 3,
  productFingerprint: 'product',
  workloadFingerprint: 'workload',
  environment: {
    architecture: 'arm64',
    cpu: 'test',
    host: 'test',
    osRelease: 'test',
    platform: 'darwin',
    runtime: 'test',
  },
}
describe('measurement compatibility', () => {
  test('allows product changes for historical comparison but not report assembly', () => {
    const changed = { ...identity, productFingerprint: 'next', runId: 'second' }
    expect(compatibleIdentity(identity, changed, false)).toBe(true)
    expect(compatibleIdentity(identity, changed)).toBe(false)
  })
  test('rejects workload, methodology and environment changes', () => {
    expect(compatibleIdentity(identity, { ...identity, workloadFingerprint: 'different' }, false)).toBe(false)
    expect(compatibleIdentity(identity, { ...identity, methodologyVersion: 4 }, false)).toBe(false)
    expect(
      compatibleIdentity(identity, { ...identity, environment: { ...identity.environment, runtime: 'other' } }, false)
    ).toBe(false)
  })
  test('includes scenario-specific batch and warmup in history matching', () => {
    const result = {
      profile: 'native' as const,
      runtime: 'Direct Fetch',
      scenario: 'static-get' as const,
      samples: [1],
      iterations: 100,
      warmup: 25,
    }
    expect(resultKey(result)).not.toBe(resultKey({ ...result, iterations: 200 }))
    expect(resultKey(result)).not.toBe(resultKey({ ...result, warmup: 50 }))
  })
})

test('preserves raw batches and process groups while excluding incompatible per-scenario settings', async () => {
  const { aggregateResults } = await import('./history')
  const { summarizeBenchmarkResult } = await import('./index')
  const result = summarizeBenchmarkResult(
    'native',
    'Direct Fetch',
    'static-get',
    [1, 9],
    1,
    'Direct Fetch',
    undefined,
    100,
    10
  )
  const [aggregate] = aggregateResults(
    [result],
    [
      { results: [{ ...result, processIds: [11], sampleGroups: [[1, 9]] }] },
      { results: [{ ...result, samples: [3, 7], processIds: [12], sampleGroups: [[3, 7]] }] },
      { results: [{ ...result, iterations: 200, samples: [1000], sampleGroups: [[1000]] }] },
    ]
  )
  expect(aggregate?.samples).toEqual([1, 9, 3, 7])
  expect(aggregate?.sampleGroups).toEqual([
    [1, 9],
    [3, 7],
  ])
  expect(aggregate?.processIds).toEqual([11, 12])
  expect(aggregate?.runs).toBe(2)
})
