import { defineContract, response, route, router } from '@hulla/api'
import { defineClient } from '@hulla/api/client'
import { inProcessTransport } from '@hulla/api/in-process'
import { defineServer } from '@hulla/api/server'
import { describe, expect, expectTypeOf, test, vi } from 'vitest'
import { z } from 'zod'
import {
  astroAdapter,
  astroInProcessTransport,
  type AstroContext,
  type AstroContextInput,
  type AstroRouteHandler,
  type AstroServerErrorInput,
} from '../src'

const contract = defineContract({
  basePath: '/api',
  routes: {
    health: route.get('/health', { responses: { 200: response.json(z.literal('ok')) } }),
    search: route.query('/search', {
      query: z.object({ term: z.string() }),
      responses: { 200: response.json(z.object({ term: z.string() })) },
    }),
    users: router('/users', {
      routes: {
        create: route.post('/', {
          body: z.object({ name: z.string() }),
          responses: { 201: response.json(z.object({ id: z.string(), name: z.string() })) },
        }),
      },
    }),
  },
})

function astroContext(request: Request, overrides: Partial<AstroContext> = {}): AstroContext {
  return {
    request,
    params: {},
    locals: {},
    url: new URL(request.url),
    ...overrides,
  } as unknown as AstroContext
}

describe('Astro integration', () => {
  test('creates one ALL-compatible API route for standard and custom methods', async () => {
    const implementation = defineServer(contract).implement({
      health: () => ({ status: 200, body: 'ok' }),
      search: ({ query }) => ({ status: 200, body: query }),
      users: {
        create: ({ body }) => ({ status: 201, body: { id: 'user-1', name: body.name } }),
      },
    })
    const handler = astroAdapter().mount(implementation)

    expectTypeOf(handler).toEqualTypeOf<AstroRouteHandler>()

    const getResult = await handler(astroContext(new Request('https://example.com/api/health')))
    expect(getResult.status).toBe(200)
    await expect(getResult.json()).resolves.toBe('ok')

    const postResult = await handler(
      astroContext(
        new Request('https://example.com/api/users', {
          method: 'POST',
          headers: { 'content-type': 'application/json' },
          body: JSON.stringify({ name: 'Ada' }),
        })
      )
    )
    expect(postResult.status).toBe(201)
    await expect(postResult.json()).resolves.toEqual({ id: 'user-1', name: 'Ada' })

    const queryResult = await handler(
      astroContext(new Request('https://example.com/api/search?term=typed', { method: 'QUERY' }))
    )
    expect(queryResult.status).toBe(200)
    await expect(queryResult.json()).resolves.toEqual({ term: 'typed' })
  })

  test('services Astro HEAD requests through the contract GET route', async () => {
    let requestMethod: string | undefined
    let astroRequestMethod: string | undefined
    const adapter = astroAdapter()
    const implementation = defineServer(contract, {
      context: adapter.context(({ astroContext: nativeContext, request }) => {
        requestMethod = request.method
        astroRequestMethod = nativeContext.request.method
        return {}
      }),
    }).implement(contract.routes.health, () => ({ status: 200, body: 'ok' }))
    const handler = adapter.mount(implementation)

    const result = await handler(astroContext(new Request('https://example.com/api/health', { method: 'HEAD' })))

    expect(result.status).toBe(200)
    expect(result.body).toBeNull()
    expect(requestMethod).toBe('GET')
    expect(astroRequestMethod).toBe('HEAD')
  })

  test('exposes Astro locals and internal render request separately from contract route metadata', async () => {
    let contextInput: AstroContextInput<typeof contract> | undefined
    const adapter = astroAdapter()
    const implementation = defineServer(contract, {
      context: adapter.context(({ astroContext: nativeContext, request, route: routeMetadata }) => {
        contextInput = {
          astroContext: nativeContext,
          request,
          route: routeMetadata,
        } as AstroContextInput<typeof contract>
        return { actor: (nativeContext.locals as { readonly actor?: string }).actor }
      }),
    }).implement(contract.routes.health, ({ context }) => ({
      status: 200,
      body: context.actor === 'Ada' ? 'ok' : 'ok',
    }))
    const request = new Request('https://example.com/api/health')
    const nativeContext = astroContext(request, { locals: { actor: 'Ada' } })

    await adapter.mount(implementation)(nativeContext)

    expect(contextInput?.request).toBe(request)
    expect(contextInput?.astroContext).toBe(nativeContext)
    expect(contextInput?.route).toEqual({ key: ['health'], method: 'GET', path: '/api/health' })
    expect(() => inProcessTransport(implementation as never)).toThrow(
      'Server requires the astro adapter, but was mounted with in-process'
    )
  })

  test('forwards Astro context to the endpoint error hook', async () => {
    const onError = vi.fn<(input: AstroServerErrorInput) => Response>(({ defaultResponse }) =>
      Response.json({ replaced: true }, { status: defaultResponse.status })
    )
    const implementation = defineServer(contract).implement(
      contract.routes.health,
      (): { readonly body: 'ok'; readonly status: 200 } => {
        throw new Error('failure')
      }
    )
    const request = new Request('https://example.com/api/health')
    const nativeContext = astroContext(request, { locals: { actor: 'Ada' } })
    const result = await astroAdapter({ onError }).mount(implementation)(nativeContext)

    expect(result.status).toBe(500)
    await expect(result.json()).resolves.toEqual({ replaced: true })
    expect(onError).toHaveBeenCalledWith(
      expect.objectContaining({
        astroContext: nativeContext,
        phase: 'handler',
        request,
        route: expect.objectContaining({ key: ['health'] }),
      })
    )
  })

  test('runs the typed client without a network request inside an Astro server island', async () => {
    let contextRequestUrl: string | undefined
    let contextRoutePath: string | undefined
    const adapter = astroAdapter()
    const implementation = defineServer(contract, {
      context: adapter.context(({ astroContext: nativeContext, request, route: routeMetadata }) => {
        contextRequestUrl = request.url
        contextRoutePath = routeMetadata.path
        return {
          actor: (nativeContext.locals as { readonly actor?: string }).actor,
          islandUrl: nativeContext.request.url,
        }
      }),
    }).implement({
      health: ({ context }) => ({ status: 200, body: context.actor === 'Ada' ? 'ok' : 'ok' }),
      search: ({ query }) => ({ status: 200, body: query }),
      users: {
        create: ({ body }) => ({ status: 201, body: { id: 'user-1', name: body.name } }),
      },
    })
    const islandRequest = new Request('https://example.com/_server-islands/Avatar', {
      headers: { cookie: 'session=session-1', referer: 'https://example.com/profile' },
    })
    const nativeContext = astroContext(islandRequest, { locals: { actor: 'Ada' } })
    const api = defineClient(contract, {
      transport: astroInProcessTransport(implementation, nativeContext),
    }).create()

    await expect(api.health()).resolves.toEqual(expect.objectContaining({ status: 200, body: 'ok' }))
    await expect(api.search({ query: { term: 'island' } })).resolves.toEqual(
      expect.objectContaining({ status: 200, body: { term: 'island' } })
    )
    await expect(api.users.create({ body: { name: 'Ada' } })).resolves.toEqual(
      expect.objectContaining({ status: 201, body: { id: 'user-1', name: 'Ada' } })
    )

    expect(contextRequestUrl).toBe('https://example.com/_server-islands/Avatar')
    expect(contextRoutePath).toBe('/api/users')
  })

  test('honors an already-aborted in-process request', async () => {
    const implementation = defineServer(contract).implement(contract.routes.health, () => ({
      status: 200,
      body: 'ok',
    }))
    const api = defineClient(contract, {
      transport: astroInProcessTransport(
        implementation,
        astroContext(new Request('https://example.com/_server-islands/Health'))
      ),
    }).create(contract.routes.health)
    const controller = new AbortController()
    controller.abort(new Error('cancelled'))

    await expect(api({ signal: controller.signal })).rejects.toThrow('cancelled')
  })
})
