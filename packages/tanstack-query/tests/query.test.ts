import { defineContract, response, route, router } from '@hulla/api'
import { defineClient } from '@hulla/api/client'
import { fetchTransport } from '@hulla/api/fetch'
import { describe, expect, expectTypeOf, test, vi } from 'vitest'
import { z } from 'zod'
import { createTanStackQuery } from '../src'

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

describe('TanStack Query integration', () => {
  test('exposes shared keys plus bound query and mutation options', async () => {
    const fetcher = vi.fn<(request: Request) => Promise<Response>>(async (request) =>
      request.url.endsWith('/health') ? json('ok') : json({ id: request.url.split('/').at(-1) })
    )
    const client = defineClient(contract, {
      transport: fetchTransport({ baseUrl: 'https://api.example.com', fetch: fetcher }),
    }).create()
    const tanstack = createTanStackQuery(client)
    const input = { params: { id: 'user-1' } }

    expectTypeOf(tanstack.users.queryKey()).toEqualTypeOf<readonly ['users']>()
    expectTypeOf(tanstack.users.byId.queryKey()).toEqualTypeOf<readonly ['users', 'byId']>()
    expectTypeOf<Parameters<typeof tanstack.users.byId.queryKey>[0]>().toExtend<{
      readonly params: { id: string }
    }>()
    const query = tanstack.users.byId.queryOptions(input)
    expectTypeOf(query.queryKey[0]).toEqualTypeOf<'users'>()
    expectTypeOf(query.queryKey[1]).toEqualTypeOf<'byId'>()
    expectTypeOf(query.queryKey[2]).toExtend<{ readonly params: { id: string } }>()
    expectTypeOf<Awaited<ReturnType<typeof query.queryFn>>['body']>().toEqualTypeOf<{ id: string }>()

    expect(tanstack.health.queryKey()).toEqual(['health'])
    expect(tanstack.users.queryKey()).toEqual(['users'])
    expect(tanstack.users.byId.queryKey()).toEqual(['users', 'byId'])
    expect(tanstack.users.byId.queryKey(input)).toEqual(['users', 'byId', input])
    expect(query.queryKey).toEqual(['users', 'byId', input])
    expect('queryOptions' in tanstack.users).toBe(false)
    expect('mutationOptions' in tanstack.users).toBe(false)
    const invalidRouterOptions = () => {
      // @ts-expect-error Query options are available only on callable routes.
      tanstack.users.queryOptions()
      // @ts-expect-error Mutation options are available only on callable routes.
      tanstack.users.mutationOptions()
    }
    expectTypeOf(invalidRouterOptions).toBeFunction()
    await expect(query.queryFn()).resolves.toMatchObject({ status: 200, body: { id: 'user-1' } })

    const boundMutation = tanstack.users.byId.mutationOptions(input)
    const unboundMutation = tanstack.users.byId.mutationOptions()
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
    const fetcher = vi.fn<(_request: Request) => Promise<Response>>(async () => json({ id: 'user-1' }))
    const client = defineClient(contract, {
      transport: fetchTransport({ baseUrl: 'https://api.example.com', fetch: fetcher }),
    }).create()
    const tanstack = createTanStackQuery(client)

    // @ts-expect-error Input routes require bound query input.
    expect(() => tanstack.users.byId.queryOptions()).toThrow('requires the route input')
    await tanstack.users.byId.queryOptions({ params: { id: 'user-1' } }).queryFn({
      signal: controller.signal,
    })

    const requestSignal = (fetcher.mock.calls[0]![0] as Request).signal
    expect(requestSignal.aborted).toBe(false)
    controller.abort()
    expect(requestSignal.aborted).toBe(true)
  })
})
