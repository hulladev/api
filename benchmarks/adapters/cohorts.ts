import type { Benchmark } from '../harness'

export type AdapterCohort = {
  readonly adapter: 'express' | 'fetch' | 'next' | 'tanstack-start'
  readonly competitor: 'direct' | 'hono' | 'orpc' | 'trpc' | 'ts-rest'
}

export const adapterCohorts: readonly AdapterCohort[] = [
  { adapter: 'fetch', competitor: 'ts-rest' },
  { adapter: 'fetch', competitor: 'trpc' },
  { adapter: 'fetch', competitor: 'orpc' },
  { adapter: 'fetch', competitor: 'hono' },
  { adapter: 'express', competitor: 'ts-rest' },
  { adapter: 'express', competitor: 'trpc' },
  { adapter: 'express', competitor: 'orpc' },
  { adapter: 'next', competitor: 'direct' },
  { adapter: 'next', competitor: 'ts-rest' },
  { adapter: 'next', competitor: 'trpc' },
  { adapter: 'next', competitor: 'orpc' },
  { adapter: 'next', competitor: 'hono' },
  { adapter: 'tanstack-start', competitor: 'direct' },
  { adapter: 'tanstack-start', competitor: 'trpc' },
  { adapter: 'tanstack-start', competitor: 'orpc' },
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
    cohort.adapter === 'fetch'
      ? (await import('./fetch')).fetchAdapterBenchmarks
      : cohort.adapter === 'express'
        ? (await import('./express')).adapterRuntimeBenchmarks
        : (await import('./frameworks')).frameworkAdapterBenchmarks.filter(({ scenario }) =>
            cohort.adapter === 'next'
              ? scenario.startsWith('next-adapter-')
              : scenario.startsWith('tanstack-start-adapter-')
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
