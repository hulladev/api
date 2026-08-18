import { defineContract, response, route, router } from '@hulla/api'
import { defineClient } from '@hulla/api/client'
import { describe, expect, expectTypeOf, test, vi } from 'vitest'
import { z } from 'zod'
import { swrPlugin } from '../src'

const contract = defineContract({
  routes: {
    health: route.get('/health', { responses: { 200: response.json(z.literal('ok')) } }),
    users: router('/users', {
      routes: {
        byId: route.get('/:id', {
          params: z.object({ id: z.string() }),
          responses: { 200: response.json(z.object({ id: z.string() })) },
        }),
      },
    }),
  },
})

function json(value: unknown): Response {
  return new Response(JSON.stringify(value), { status: 200, headers: { 'content-type': 'application/json' } })
}

describe('SWR plugin', () => {
  test('exposes bound and root query/mutation tuples with shared keys', async () => {
    const fetcher = vi.fn(async (request: Request) =>
      request.url.endsWith('/health') ? json('ok') : json({ id: request.url.split('/').at(-1) })
    )
    const client = defineClient(contract, {
      baseUrl: 'https://api.example.com',
      fetch: fetcher,
      plugins: [swrPlugin()],
    }).build()
    const input = { params: { id: 'user-1' } }

    const [boundKey, boundFetcher] = client.users.byId.$swr.queryOptions(input)
    const [rootKey, rootFetcher] = client.users.byId.$swr.queryOptions()
    expectTypeOf(boundKey[0]).toEqualTypeOf<'users/byId'>()
    expectTypeOf(boundKey[1]).toExtend<{ readonly params: { id: string } }>()
    expectTypeOf(rootKey).toEqualTypeOf<readonly ['users/byId']>()
    expectTypeOf<Parameters<typeof rootFetcher>[0]>().toExtend<{ readonly params: { id: string } }>()

    expect(client.users.byId.$key.root).toBe('users/byId')
    expect(boundKey).toEqual(['users/byId', input])
    expect(rootKey).toEqual(['users/byId'])
    await expect(boundFetcher()).resolves.toMatchObject({ body: { id: 'user-1' } })
    await expect(rootFetcher(input)).resolves.toMatchObject({ body: { id: 'user-1' } })

    const [mutationKey, mutate] = client.users.byId.$swr.mutationOptions(input)
    expect(mutationKey).toEqual(['users/byId', input])
    await expect(mutate()).resolves.toMatchObject({ body: { id: 'user-1' } })
  })

  test('supports no-input routes and custom namespaces', async () => {
    const client = defineClient(contract, {
      baseUrl: 'https://api.example.com',
      fetch: async () => json('ok'),
      plugins: [swrPlugin({ namespace: 'cache' })],
    }).build()
    const [key, fetcher] = client.health.$cache.queryOptions()

    expectTypeOf(key).toEqualTypeOf<readonly ['health']>()
    expect(key).toEqual(['health'])
    await expect(fetcher()).resolves.toMatchObject({ body: 'ok' })
  })
})
