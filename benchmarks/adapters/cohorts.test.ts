import { describe, expect, test } from 'vitest'
import type { Benchmark } from '../harness'
import { adapterCohorts, selectAdapterCohortBenchmarks } from './cohorts'

const source = (
  [
    { runtime: 'Direct Cloudflare Workers', scenario: 'cloudflare-adapter-static-dispatch' },
    { runtime: '@hulla/api Cloudflare Workers', scenario: 'cloudflare-adapter-static-dispatch' },
    { runtime: 'tRPC Cloudflare Workers', scenario: 'cloudflare-adapter-static-dispatch' },
    { runtime: 'oRPC Cloudflare Workers', scenario: 'cloudflare-adapter-static-dispatch' },
    { runtime: 'Hono Cloudflare Workers', scenario: 'cloudflare-adapter-static-dispatch' },
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
    { runtime: 'Direct Fastify', scenario: 'fastify-adapter-static-dispatch' },
    { runtime: '@hulla/api Fastify', scenario: 'fastify-adapter-static-dispatch' },
    { runtime: 'tRPC Fastify', scenario: 'fastify-adapter-static-dispatch' },
    { runtime: 'oRPC Fastify', scenario: 'fastify-adapter-static-dispatch' },
    { runtime: 'Direct H3', scenario: 'h3-adapter-static-dispatch' },
    { runtime: '@hulla/api H3', scenario: 'h3-adapter-static-dispatch' },
    { runtime: 'tRPC H3', scenario: 'h3-adapter-static-dispatch' },
    { runtime: 'oRPC H3', scenario: 'h3-adapter-static-dispatch' },
    { runtime: 'Direct Hono', scenario: 'hono-adapter-static-dispatch' },
    { runtime: '@hulla/api Hono', scenario: 'hono-adapter-static-dispatch' },
    { runtime: 'tRPC Hono', scenario: 'hono-adapter-static-dispatch' },
    { runtime: 'oRPC Hono', scenario: 'hono-adapter-static-dispatch' },
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
    { runtime: 'Direct SolidStart', scenario: 'solid-start-adapter-static-dispatch' },
    { runtime: '@hulla/api SolidStart', scenario: 'solid-start-adapter-static-dispatch' },
    { runtime: 'tRPC SolidStart', scenario: 'solid-start-adapter-static-dispatch' },
    { runtime: 'oRPC SolidStart', scenario: 'solid-start-adapter-static-dispatch' },
    { runtime: 'Direct SvelteKit', scenario: 'sveltekit-adapter-static-dispatch' },
    { runtime: '@hulla/api SvelteKit', scenario: 'sveltekit-adapter-static-dispatch' },
    { runtime: 'tRPC SvelteKit', scenario: 'sveltekit-adapter-static-dispatch' },
    { runtime: 'oRPC SvelteKit', scenario: 'sveltekit-adapter-static-dispatch' },
  ] as const
).map((benchmark) => ({ ...benchmark, run: async () => {} })) satisfies readonly Benchmark[]

describe('adapter benchmark cohorts', () => {
  test('isolates every competitor with direct and @hulla/api baselines', () => {
    for (const cohort of adapterCohorts) {
      const adapterSource = source.filter(({ scenario }) => {
        if (cohort.adapter === 'fetch') return scenario.startsWith('fetch-adapter-')
        if (cohort.adapter === 'express') return scenario.startsWith('adapter-')
        return scenario.startsWith(`${cohort.adapter}-adapter-`)
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
