import { defineContract, response, route, router } from '@hulla/api'
import { defineClient } from '@hulla/api/client'
import { inProcessTransport } from '@hulla/api/in-process'
import { defineServer } from '@hulla/api/server'
import { NextRequest } from 'next/server'
import { describe, expect, expectTypeOf, test, vi } from 'vitest'
import { z } from 'zod'
import {
  createRouteHandler,
  createNextCache,
  nextFetchTransport,
  nextAdapter,
  nextRouteTag,
  nextRouteTags,
  type NextServerErrorInput,
  type NextRouteContext,
  type NextRouteHandler,
} from '../src'

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
        rename: route.post('/:id', {
          params: z.object({ id: z.string() }),
          body: z.object({ name: z.string() }),
          responses: { 200: response.json(z.object({ id: z.string(), name: z.string() })) },
        }),
      },
    }),
  },
})

function json(value: unknown): Response {
  return Response.json(value, { status: 200 })
}

describe('Next.js integration', () => {
  test('adapts an implementation to an App Router Route Handler', async () => {
    type AppRouteContext = NextRouteContext<{ readonly hulla: string[] }>
    let contextRequest: NextRequest | undefined
    let contextParams: { readonly hulla: string[] } | undefined
    const implementation = defineServer(contract, {
      adapter: nextAdapter<AppRouteContext>(),
      context: async ({ request, routeContext }) => {
        expectTypeOf(routeContext).toEqualTypeOf<AppRouteContext>()
        contextRequest = request
        contextParams = await routeContext.params
        return { requestMethod: request.method }
      },
    }).implement({
      health: ({ context }) => ({ status: 200, body: context.requestMethod === 'GET' ? 'ok' : 'ok' }),
      users: {
        byId: ({ params }) => ({ status: 200, body: { id: params.id } }),
        rename: ({ body, params }) => ({ status: 200, body: { id: params.id, name: body.name } }),
      },
    })
    const handler = createRouteHandler(implementation)

    expectTypeOf(handler).toEqualTypeOf<NextRouteHandler<AppRouteContext>>()
    const request = new NextRequest('https://example.com/api/users/user-1')
    const routeContext: AppRouteContext = { params: Promise.resolve({ hulla: ['users', 'user-1'] }) }
    const result = await handler(request, routeContext)

    expect(contextRequest).toBe(request)
    expect(contextParams).toEqual({ hulla: ['users', 'user-1'] })
    expect(result.status).toBe(200)
    await expect(result.json()).resolves.toEqual({ id: 'user-1' })
    expect(() => inProcessTransport(implementation as never)).toThrow(
      'Server requires the next adapter, but was mounted with in-process'
    )
  })

  test('applies typed GET policies without taking over Next fetch execution', async () => {
    expectTypeOf(nextFetchTransport({ fetch: globalThis.fetch })).toBeFunction()
    const fetcher = vi.fn<(_request: Request, _options?: object) => Promise<Response>>(async () =>
      json({ id: 'user-1' })
    )
    const cache = createNextCache(contract, {
      namespace: 'admin-api',
      routes: {
        users: {
          byId: (request) => {
            expectTypeOf(request.key[0]).toEqualTypeOf<'users'>()
            expectTypeOf(request.key[1]).toEqualTypeOf<'byId'>()
            expectTypeOf(request.method).toEqualTypeOf<'GET'>()
            return {
              cache: 'force-cache',
              next: { revalidate: 60, tags: ['tenant:one'] },
            }
          },
        },
      },
    })
    const client = defineClient(contract, {
      transport: cache.fetchTransport({
        baseUrl: 'https://api.example.com',
        fetch: fetcher,
      }),
    }).create()

    await expect(client.users.byId({ params: { id: 'user-1' } })).resolves.toMatchObject({
      status: 200,
      body: { id: 'user-1' },
    })

    const [request, options] = fetcher.mock.calls[0]!
    expect(request.url).toBe('https://api.example.com/api/users/user-1')
    expect(options).toEqual({
      cache: 'force-cache',
      next: {
        revalidate: 60,
        tags: ['admin-api', 'admin-api:users', 'admin-api:users:byId', 'tenant:one'],
      },
    })

    expect(cache.tag(contract)).toBe('admin-api')
    expect(cache.tag(contract.routes.users)).toBe('admin-api:users')
    expect(cache.tag(contract.routes.users.byId)).toBe('admin-api:users:byId')
    expect(cache.tags(contract.routes.users.byId)).toEqual(['admin-api', 'admin-api:users', 'admin-api:users:byId'])

    const invalidPolicies = () =>
      createNextCache(contract, {
        routes: {
          users: {
            // @ts-expect-error Mutation routes cannot have Next Data Cache policies.
            rename: { cache: 'force-cache' },
          },
        },
      })
    expectTypeOf(invalidPolicies).toBeFunction()

    const foreignContract = defineContract({
      routes: { health: route.get('/health', { responses: { 200: response.empty() } }) },
    })
    expect(() => cache.tag(foreignContract.routes.health as never)).toThrow('must belong to its contract')
  })

  test('creates collision-safe structural cache tags for prefix invalidation', () => {
    expect(nextRouteTag([])).toBe('hulla')
    expect(nextRouteTag(['users', 'by:id'])).toBe('hulla:users:by%3Aid')
    expect(nextRouteTag(['users'], { namespace: 'admin' })).toBe('admin:users')
    expect(nextRouteTag([], { namespace: 'admin:api' })).toBe('admin%3Aapi')
    expect(nextRouteTags(['users', 'byId'])).toEqual(['hulla', 'hulla:users', 'hulla:users:byId'])

    expect(() => nextRouteTag(['x'.repeat(257)])).toThrow('exceeds 256 characters')
    expect(() => nextRouteTag([], { namespace: '' })).toThrow('namespace must not be empty')
  })

  test('forwards route context to the adapter error hook', async () => {
    type AppRouteContext = NextRouteContext<{ readonly hulla: string[] }>
    const onError = vi.fn<(input: NextServerErrorInput<AppRouteContext>) => Response>(({ defaultResponse }) =>
      Response.json({ replaced: true }, { status: defaultResponse.status })
    )
    const implementation = defineServer(contract, { adapter: nextAdapter<AppRouteContext>() }).implement({
      health: (): { readonly body: 'ok'; readonly status: 200 } => {
        throw new Error('failure')
      },
      users: {
        byId: ({ params }) => ({ status: 200, body: { id: params.id } }),
        rename: ({ body, params }) => ({ status: 200, body: { id: params.id, name: body.name } }),
      },
    })
    const handler = createRouteHandler(implementation, { onError })
    const request = new NextRequest('https://example.com/api/health')
    const routeContext: AppRouteContext = { params: Promise.resolve({ hulla: ['health'] }) }

    const result = await handler(request, routeContext)

    expect(result.status).toBe(500)
    await expect(result.json()).resolves.toEqual({ replaced: true })
    expect(onError).toHaveBeenCalledWith(
      expect.objectContaining({
        phase: 'handler',
        request,
        routeContext,
        route: expect.objectContaining({ key: ['health'] }),
      })
    )
  })

  test('rejects QUERY routes before mounting the Next handler', () => {
    const queryContract = defineContract({
      routes: {
        search: route.query('/search', { responses: { 200: response.empty() } }),
      },
    })
    const implementation = defineServer(queryContract).implement({
      search: () => ({ status: 200 }),
    })

    expect(() => createRouteHandler(implementation)).toThrow(
      'Next.js Route Handlers do not support QUERY routes: search'
    )
  })
})
