import type { Benchmark } from '../harness'

export type AdapterCohort = {
  readonly adapter:
    | 'cloudflare'
    | 'express'
    | 'fastify'
    | 'fetch'
    | 'h3'
    | 'hono'
    | 'next'
    | 'solid-start'
    | 'sveltekit'
    | 'tanstack-start'
  readonly competitor: 'direct' | 'hono' | 'orpc' | 'trpc' | 'ts-rest'
}

export const adapterCohorts: readonly AdapterCohort[] = [
  { adapter: 'cloudflare', competitor: 'direct' },
  { adapter: 'cloudflare', competitor: 'trpc' },
  { adapter: 'cloudflare', competitor: 'orpc' },
  { adapter: 'cloudflare', competitor: 'hono' },
  { adapter: 'fetch', competitor: 'ts-rest' },
  { adapter: 'fetch', competitor: 'trpc' },
  { adapter: 'fetch', competitor: 'orpc' },
  { adapter: 'fetch', competitor: 'hono' },
  { adapter: 'express', competitor: 'ts-rest' },
  { adapter: 'express', competitor: 'trpc' },
  { adapter: 'express', competitor: 'orpc' },
  { adapter: 'fastify', competitor: 'direct' },
  { adapter: 'fastify', competitor: 'trpc' },
  { adapter: 'fastify', competitor: 'orpc' },
  { adapter: 'h3', competitor: 'direct' },
  { adapter: 'h3', competitor: 'trpc' },
  { adapter: 'h3', competitor: 'orpc' },
  { adapter: 'hono', competitor: 'direct' },
  { adapter: 'hono', competitor: 'trpc' },
  { adapter: 'hono', competitor: 'orpc' },
  { adapter: 'next', competitor: 'direct' },
  { adapter: 'next', competitor: 'ts-rest' },
  { adapter: 'next', competitor: 'trpc' },
  { adapter: 'next', competitor: 'orpc' },
  { adapter: 'next', competitor: 'hono' },
  { adapter: 'tanstack-start', competitor: 'direct' },
  { adapter: 'tanstack-start', competitor: 'trpc' },
  { adapter: 'tanstack-start', competitor: 'orpc' },
  { adapter: 'solid-start', competitor: 'direct' },
  { adapter: 'solid-start', competitor: 'trpc' },
  { adapter: 'solid-start', competitor: 'orpc' },
  { adapter: 'sveltekit', competitor: 'direct' },
  { adapter: 'sveltekit', competitor: 'trpc' },
  { adapter: 'sveltekit', competitor: 'orpc' },
]

const competitorPrefix: Readonly<Record<AdapterCohort['competitor'], string>> = {
  direct: 'Direct ',
  hono: 'Hono',
  orpc: 'oRPC',
  trpc: 'tRPC',
  'ts-rest': 'ts-rest',
}

export function selectAdapterCohortBenchmarks(
  source: readonly Benchmark[],
  cohort: AdapterCohort
): readonly Benchmark[] {
  const selectedPrefix = competitorPrefix[cohort.competitor]
  return source.filter((benchmark) => {
    if (cohort.competitor === 'direct') {
      return benchmark.runtime.startsWith('Direct ') || benchmark.runtime.startsWith('@hulla/api')
    }
    if (benchmark.runtime.startsWith('Direct ') || benchmark.runtime.startsWith('@hulla/api')) {
      return cohort.competitor === 'ts-rest' || benchmark.scenario !== 'adapter-registration'
    }
    return benchmark.runtime.startsWith(selectedPrefix)
  })
}

export async function adapterCohortBenchmarks(cohort: AdapterCohort): Promise<readonly Benchmark[]> {
  const source =
    cohort.adapter === 'cloudflare'
      ? (await import('./cloudflare')).cloudflareAdapterBenchmarks
      : cohort.adapter === 'fetch'
        ? (await import('./fetch')).fetchAdapterBenchmarks
        : cohort.adapter === 'express'
          ? (await import('./express')).adapterRuntimeBenchmarks
          : cohort.adapter === 'fastify'
            ? (await import('./fastify')).fastifyAdapterBenchmarks
            : cohort.adapter === 'h3'
              ? (await import('./h3')).h3AdapterBenchmarks
              : cohort.adapter === 'hono'
                ? (await import('./hono-adapter')).honoAdapterBenchmarks
                : (await import('./frameworks')).frameworkAdapterBenchmarks.filter(({ scenario }) =>
                    cohort.adapter === 'next'
                      ? scenario.startsWith('next-adapter-')
                      : cohort.adapter === 'tanstack-start'
                        ? scenario.startsWith('tanstack-start-adapter-')
                        : cohort.adapter === 'solid-start'
                          ? scenario.startsWith('solid-start-adapter-')
                          : scenario.startsWith('sveltekit-adapter-')
                  )
  return selectAdapterCohortBenchmarks(source, cohort)
}

export function parseAdapterCohort(adapter: string | undefined, competitor: string | undefined): AdapterCohort {
  const cohort = adapterCohorts.find(
    (candidate) => candidate.adapter === adapter && candidate.competitor === competitor
  )
  if (cohort === undefined)
    throw new TypeError(`Unknown adapter cohort: ${adapter ?? '(missing)'}/${competitor ?? '(missing)'}`)
  return cohort
}
