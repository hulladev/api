import { defineContract, response, route, router } from '@hulla/api'
import { defineClient } from '@hulla/api/client'
import { fetchTransport } from '@hulla/api/fetch'
import { describe, expect, expectTypeOf, test, vi } from 'vitest'
import { z } from 'zod'
import { createSWR } from '../src'

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

describe('SWR integration', () => {
  test('exposes query keys plus bound query and mutation tuples', async () => {
    const fetcher = vi.fn<(request: Request) => Promise<Response>>(async (request) =>
      request.url.endsWith('/health') ? json('ok') : json({ id: request.url.split('/').at(-1) })
    )
    const client = defineClient(contract, {
      transport: fetchTransport({ baseUrl: 'https://api.example.com', fetch: fetcher }),
    }).create()
    const swr = createSWR(client)
    const input = { params: { id: 'user-1' } }

    const [boundKey, boundFetcher] = swr.users.byId.queryOptions(input)
    expectTypeOf(boundKey[0]).toEqualTypeOf<'users'>()
    expectTypeOf(boundKey[1]).toEqualTypeOf<'byId'>()
    expectTypeOf(boundKey[2]).toExtend<{ readonly params: { id: string } }>()
    expectTypeOf(swr.users.queryKey()).toEqualTypeOf<readonly ['users']>()
    expectTypeOf(swr.users.byId.queryKey()).toEqualTypeOf<readonly ['users', 'byId']>()

    expect(swr.users.queryKey()).toEqual(['users'])
    expect(swr.users.byId.queryKey()).toEqual(['users', 'byId'])
    expect(swr.users.byId.queryKey(input)).toEqual(['users', 'byId', input])
    expect(boundKey).toEqual(['users', 'byId', input])
    expect('queryOptions' in swr.users).toBe(false)
    expect('mutationOptions' in swr.users).toBe(false)
    const invalidRouterOptions = () => {
      // @ts-expect-error Query options are available only on callable routes.
      swr.users.queryOptions()
      // @ts-expect-error Mutation options are available only on callable routes.
      swr.users.mutationOptions()
    }
    expectTypeOf(invalidRouterOptions).toBeFunction()
    await expect(boundFetcher()).resolves.toMatchObject({ body: { id: 'user-1' } })

    const [mutationKey, mutate] = swr.users.byId.mutationOptions(input)
    expect(mutationKey).toEqual(['users', 'byId', input])
    await expect(mutate()).resolves.toMatchObject({ body: { id: 'user-1' } })

    const [rootMutationKey, mutateWithInput] = swr.users.byId.mutationOptions()
    expect(rootMutationKey).toEqual(['users', 'byId'])
    await expect(mutateWithInput(input)).resolves.toMatchObject({ body: { id: 'user-1' } })
  })

  test('requires query input while supporting no-input routes', async () => {
    const client = defineClient(contract, {
      transport: fetchTransport({ baseUrl: 'https://api.example.com', fetch: async () => json('ok') }),
    }).create()
    const swr = createSWR(client)

    // @ts-expect-error Input routes require bound query input.
    expect(() => swr.users.byId.queryOptions()).toThrow('requires the route input')

    const [key, fetcher] = swr.health.queryOptions()

    expectTypeOf(key).toEqualTypeOf<readonly ['health']>()
    expect(swr.health.queryKey()).toEqual(['health'])
    expect(key).toEqual(['health'])
    await expect(fetcher()).resolves.toMatchObject({ body: 'ok' })
  })
})
