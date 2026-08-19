import { defineContract, response, route, router } from '@hulla/api'
import { defineClient } from '@hulla/api/client'
import { defineProcedures } from '@hulla/api/procedure'
import { describe, expect, expectTypeOf, test, vi } from 'vitest'
import { z } from 'zod'
import { tanstackQueryPlugin } from '../src'

const contract = defineContract({
  basePath: '/api',
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

describe('TanStack Query plugin', () => {
  test('exposes shared keys plus bound query and mutation options', async () => {
    const fetcher = vi.fn(async (request: Request) =>
      request.url.endsWith('/health') ? json('ok') : json({ id: request.url.split('/').at(-1) })
    )
    const client = defineClient(contract, {
      baseUrl: 'https://api.example.com',
      fetch: fetcher,
      plugins: [tanstackQueryPlugin()],
    }).build()
    const input = { params: { id: 'user-1' } }

    expectTypeOf(client.users.$queryKey()).toEqualTypeOf<readonly ['users']>()
    expectTypeOf(client.users.byId.$queryKey()).toEqualTypeOf<readonly ['users', 'byId']>()
    expectTypeOf<Parameters<typeof client.users.byId.$queryKey>[0]>().toExtend<{
      readonly params: { id: string }
    }>()
    const query = client.users.byId.$queryOptions(input)
    expectTypeOf(query.queryKey[0]).toEqualTypeOf<'users'>()
    expectTypeOf(query.queryKey[1]).toEqualTypeOf<'byId'>()
    expectTypeOf(query.queryKey[2]).toExtend<{ readonly params: { id: string } }>()
    expectTypeOf<Awaited<ReturnType<typeof query.queryFn>>['body']>().toEqualTypeOf<{ id: string }>()

    expect(client.health.$queryKey()).toEqual(['health'])
    expect(client.users.$queryKey()).toEqual(['users'])
    expect(client.users.byId.$queryKey()).toEqual(['users', 'byId'])
    expect(client.users.byId.$queryKey(input)).toEqual(['users', 'byId', input])
    expect(query.queryKey).toEqual(['users', 'byId', input])
    expect('$queryOptions' in client.users).toBe(false)
    expect('$mutationOptions' in client.users).toBe(false)
    const invalidRouterOptions = () => {
      // @ts-expect-error Query options are available only on callable routes.
      client.users.$queryOptions()
      // @ts-expect-error Mutation options are available only on callable routes.
      client.users.$mutationOptions()
    }
    expectTypeOf(invalidRouterOptions).toBeFunction()
    await expect(query.queryFn()).resolves.toMatchObject({ status: 200, body: { id: 'user-1' } })

    const boundMutation = client.users.byId.$mutationOptions(input)
    const unboundMutation = client.users.byId.$mutationOptions()
    expectTypeOf<Parameters<typeof unboundMutation.mutationFn>[0]>().toExtend<{
      readonly params: { id: string }
    }>()
    expect(boundMutation.mutationKey).toEqual(['users', 'byId', input])
    expect(unboundMutation.mutationKey).toEqual(['users', 'byId'])
    await expect(boundMutation.mutationFn()).resolves.toMatchObject({ body: { id: 'user-1' } })
    await expect(unboundMutation.mutationFn(input)).resolves.toMatchObject({ body: { id: 'user-1' } })
  })

  test('requires query input and forwards cancellation through request options', async () => {
    const controller = new AbortController()
    const fetcher = vi.fn(async (_request: Request) => json({ id: 'user-1' }))
    const client = defineClient(contract, {
      baseUrl: 'https://api.example.com',
      fetch: fetcher,
      plugins: [tanstackQueryPlugin()],
    }).build()

    // @ts-expect-error Input routes require bound query input.
    expect(() => client.users.byId.$queryOptions()).toThrow('requires the route input')
    await client.users.byId.$queryOptions({ params: { id: 'user-1' } }).queryFn({
      signal: controller.signal,
    })

    const requestSignal = (fetcher.mock.calls[0]![0] as Request).signal
    expect(requestSignal.aborted).toBe(false)
    controller.abort()
    expect(requestSignal.aborted).toBe(true)
  })

  test('supports structurally keyed procedure trees without changing result modes', async () => {
    const procedures = defineProcedures({ plugins: [tanstackQueryPlugin()] })
    const health = procedures.handler(() => 'ok')
    const asyncHealth = procedures.handler(async () => 'ok')
    const byId = procedures.input(z.object({ id: z.string() })).handler(({ input }) => ({ id: input.id }))
    const api = procedures.build({ asyncHealth, health, users: { byId } })
    const input = { id: 'user-1' }

    expectTypeOf(api.users.$queryKey()).toEqualTypeOf<readonly ['users']>()
    expectTypeOf(api.users.byId.$queryKey()).toEqualTypeOf<readonly ['users', 'byId']>()
    const query = api.users.byId.$queryOptions(input)
    expectTypeOf<ReturnType<typeof query.queryFn>>().toEqualTypeOf<{ id: string }>()

    expect(api.users.$queryKey()).toEqual(['users'])
    expect(api.users.byId.$queryKey()).toEqual(['users', 'byId'])
    expect(api.users.byId.$queryKey(input)).toEqual(['users', 'byId', input])
    expect(query.queryKey).toEqual(['users', 'byId', input])
    expect(query.queryFn()).toEqual({ id: 'user-1' })
    expect(api.health.$queryOptions().queryFn()).toBe('ok')
    const asyncQuery = api.asyncHealth.$queryOptions()
    expectTypeOf<ReturnType<typeof asyncQuery.queryFn>>().toEqualTypeOf<Promise<string>>()
    await expect(asyncQuery.queryFn()).resolves.toBe('ok')

    const boundMutation = api.users.byId.$mutationOptions(input)
    const unboundMutation = api.users.byId.$mutationOptions()
    expect(boundMutation.mutationFn()).toEqual({ id: 'user-1' })
    expect(unboundMutation.mutationFn(input)).toEqual({ id: 'user-1' })
    expect(boundMutation.mutationKey).toEqual(['users', 'byId', input])
    expect(unboundMutation.mutationKey).toEqual(['users', 'byId'])

    // @ts-expect-error Input procedures require bound query input.
    expect(() => api.users.byId.$queryOptions()).toThrow('requires the procedure input')
    expect('$queryOptions' in api.users).toBe(false)
  })
})
