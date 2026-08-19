import { defineContract, response, route, router } from '@hulla/api'
import { defineClient } from '@hulla/api/client'
import { defineProcedures } from '@hulla/api/procedure'
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
  test('exposes query keys plus bound query and mutation tuples', async () => {
    const fetcher = vi.fn(async (request: Request) =>
      request.url.endsWith('/health') ? json('ok') : json({ id: request.url.split('/').at(-1) })
    )
    const client = defineClient(contract, {
      baseUrl: 'https://api.example.com',
      fetch: fetcher,
      plugins: [swrPlugin()],
    }).build()
    const input = { params: { id: 'user-1' } }

    const [boundKey, boundFetcher] = client.users.byId.$queryOptions(input)
    expectTypeOf(boundKey[0]).toEqualTypeOf<'users'>()
    expectTypeOf(boundKey[1]).toEqualTypeOf<'byId'>()
    expectTypeOf(boundKey[2]).toExtend<{ readonly params: { id: string } }>()
    expectTypeOf(client.users.$queryKey()).toEqualTypeOf<readonly ['users']>()
    expectTypeOf(client.users.byId.$queryKey()).toEqualTypeOf<readonly ['users', 'byId']>()

    expect(client.users.$queryKey()).toEqual(['users'])
    expect(client.users.byId.$queryKey()).toEqual(['users', 'byId'])
    expect(client.users.byId.$queryKey(input)).toEqual(['users', 'byId', input])
    expect(boundKey).toEqual(['users', 'byId', input])
    expect('$queryOptions' in client.users).toBe(false)
    expect('$mutationOptions' in client.users).toBe(false)
    const invalidRouterOptions = () => {
      // @ts-expect-error Query options are available only on callable routes.
      client.users.$queryOptions()
      // @ts-expect-error Mutation options are available only on callable routes.
      client.users.$mutationOptions()
    }
    expectTypeOf(invalidRouterOptions).toBeFunction()
    await expect(boundFetcher()).resolves.toMatchObject({ body: { id: 'user-1' } })

    const [mutationKey, mutate] = client.users.byId.$mutationOptions(input)
    expect(mutationKey).toEqual(['users', 'byId', input])
    await expect(mutate()).resolves.toMatchObject({ body: { id: 'user-1' } })

    const [rootMutationKey, mutateWithInput] = client.users.byId.$mutationOptions()
    expect(rootMutationKey).toEqual(['users', 'byId'])
    await expect(mutateWithInput(input)).resolves.toMatchObject({ body: { id: 'user-1' } })
  })

  test('requires query input while supporting no-input routes', async () => {
    const client = defineClient(contract, {
      baseUrl: 'https://api.example.com',
      fetch: async () => json('ok'),
      plugins: [swrPlugin()],
    }).build()

    // @ts-expect-error Input routes require bound query input.
    expect(() => client.users.byId.$queryOptions()).toThrow('requires the route input')

    const [key, fetcher] = client.health.$queryOptions()

    expectTypeOf(key).toEqualTypeOf<readonly ['health']>()
    expect(client.health.$queryKey()).toEqual(['health'])
    expect(key).toEqual(['health'])
    await expect(fetcher()).resolves.toMatchObject({ body: 'ok' })
  })

  test('supports structurally keyed procedure trees without changing synchronous results', () => {
    const procedures = defineProcedures({ plugins: [swrPlugin()] })
    const health = procedures.handler(() => 'ok')
    const byId = procedures.input(z.object({ id: z.string() })).handler(({ input }) => ({ id: input.id }))
    const api = procedures.build({ health, users: { byId } })
    const input = { id: 'user-1' }

    const [queryKey, query] = api.users.byId.$queryOptions(input)
    expectTypeOf(api.users.$queryKey()).toEqualTypeOf<readonly ['users']>()
    expectTypeOf(api.users.byId.$queryKey()).toEqualTypeOf<readonly ['users', 'byId']>()
    expectTypeOf<ReturnType<typeof query>>().toEqualTypeOf<{ id: string }>()

    expect(api.users.$queryKey()).toEqual(['users'])
    expect(api.users.byId.$queryKey()).toEqual(['users', 'byId'])
    expect(api.users.byId.$queryKey(input)).toEqual(['users', 'byId', input])
    expect(queryKey).toEqual(['users', 'byId', input])
    expect(query()).toEqual({ id: 'user-1' })
    expect(api.health.$queryOptions()[1]()).toBe('ok')

    const [boundMutationKey, boundMutation] = api.users.byId.$mutationOptions(input)
    const [unboundMutationKey, unboundMutation] = api.users.byId.$mutationOptions()
    expect(boundMutation()).toEqual({ id: 'user-1' })
    expect(unboundMutation(input)).toEqual({ id: 'user-1' })
    expect(boundMutationKey).toEqual(['users', 'byId', input])
    expect(unboundMutationKey).toEqual(['users', 'byId'])

    // @ts-expect-error Input procedures require bound query input.
    expect(() => api.users.byId.$queryOptions()).toThrow('requires the procedure input')
    expect('$queryOptions' in api.users).toBe(false)
  })
})
