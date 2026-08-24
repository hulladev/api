import { describe, expect, test } from 'vitest'
import type { Benchmark } from '../harness'
import { adapterCohorts, selectAdapterCohortBenchmarks } from './cohorts'

const source = [
  { runtime: 'Direct Fetch', scenario: 'fetch-adapter-static-dispatch' },
  { runtime: '@hulla/api Fetch', scenario: 'fetch-adapter-static-dispatch' },
  { runtime: 'ts-rest Fetch', scenario: 'fetch-adapter-static-dispatch' },
  { runtime: 'tRPC Fetch', scenario: 'fetch-adapter-static-dispatch' },
  { runtime: 'oRPC Fetch', scenario: 'fetch-adapter-static-dispatch' },
  { runtime: 'Hono Fetch', scenario: 'fetch-adapter-static-dispatch' },
  { runtime: 'Direct Express', scenario: 'adapter-registration' },
  { runtime: '@hulla/api Express', scenario: 'adapter-registration' },
  { runtime: 'ts-rest Express', scenario: 'adapter-registration' },
  { runtime: 'Direct Express', scenario: 'adapter-static-dispatch' },
  { runtime: '@hulla/api Express', scenario: 'adapter-static-dispatch' },
  { runtime: 'tRPC Express', scenario: 'adapter-static-dispatch' },
  { runtime: 'oRPC Express/Node', scenario: 'adapter-static-dispatch' },
  { runtime: 'Direct Next.js', scenario: 'next-adapter-static-dispatch' },
  { runtime: '@hulla/api Next.js', scenario: 'next-adapter-static-dispatch' },
  { runtime: 'ts-rest Next.js', scenario: 'next-adapter-static-dispatch' },
  { runtime: 'tRPC Next.js', scenario: 'next-adapter-static-dispatch' },
  { runtime: 'oRPC Next.js', scenario: 'next-adapter-static-dispatch' },
  { runtime: 'Hono Next.js', scenario: 'next-adapter-static-dispatch' },
  { runtime: 'Direct TanStack Start', scenario: 'tanstack-start-adapter-static-dispatch' },
  { runtime: '@hulla/api TanStack Start', scenario: 'tanstack-start-adapter-static-dispatch' },
  { runtime: 'tRPC TanStack Start', scenario: 'tanstack-start-adapter-static-dispatch' },
  { runtime: 'oRPC TanStack Start', scenario: 'tanstack-start-adapter-static-dispatch' },
].map((benchmark) => ({ ...benchmark, run: async () => {} })) satisfies readonly Benchmark[]

describe('adapter benchmark cohorts', () => {
  test('isolates every competitor with direct and Hulla baselines', () => {
    for (const cohort of adapterCohorts) {
      const adapterSource = source.filter(({ scenario }) => {
        if (cohort.adapter === 'fetch') return scenario.startsWith('fetch-adapter-')
        if (cohort.adapter === 'next') return scenario.startsWith('next-adapter-')
        if (cohort.adapter === 'tanstack-start') return scenario.startsWith('tanstack-start-adapter-')
        return scenario.startsWith('adapter-')
      })
      const benchmarks = selectAdapterCohortBenchmarks(adapterSource, cohort)
      const runtimes = new Set(benchmarks.map(({ runtime }) => runtime))
      expect([...runtimes].some((runtime) => runtime.startsWith('Direct '))).toBe(true)
      expect([...runtimes].some((runtime) => runtime.startsWith('@hulla/api'))).toBe(true)
      const competitors = [...runtimes].filter(
        (runtime) => !runtime.startsWith('Direct ') && !runtime.startsWith('@hulla/api')
      )
      expect(competitors).toHaveLength(cohort.competitor === 'direct' ? 0 : 1)
      expect(competitors.every((runtime) => runtime.toLowerCase().startsWith(cohort.competitor))).toBe(true)
    }
  })

  test('omits incomparable catch-all registration rows', () => {
    for (const competitor of ['trpc', 'orpc'] as const) {
      const benchmarks = selectAdapterCohortBenchmarks(
        source.filter(({ scenario }) => !scenario.startsWith('fetch-adapter-')),
        { adapter: 'express', competitor }
      )
      expect(benchmarks.some(({ scenario }) => scenario === 'adapter-registration')).toBe(false)
    }
  })
})
