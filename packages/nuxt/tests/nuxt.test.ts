import { defineContract, response, route, router } from '@hulla/api'
import { inProcessTransport } from '@hulla/api/in-process'
import { defineServer } from '@hulla/api/server'
import { createApp, defineEventHandler, toWebHandler, type EventHandler } from 'h3'
import { describe, expect, expectTypeOf, test, vi } from 'vitest'
import { z } from 'zod'
import {
  nuxtAdapter,
  type NuxtContextInput,
  type NuxtRequestEvent,
  type NuxtRouteHandler,
  type NuxtServerErrorInput,
} from '../src/server'

const contract = defineContract({
  basePath: '/api',
  routes: {
    health: route.get('/health', { responses: { 200: response.json(z.literal('ok')) } }),
    users: router('/users', {
      routes: {
        create: route.post('/', {
          body: z.object({ name: z.string() }),
          responses: { 201: response.json(z.object({ actor: z.string(), name: z.string() })) },
        }),
      },
    }),
  },
})

function webHandler(handler: NuxtRouteHandler, middleware?: EventHandler): (request: Request) => Promise<Response> {
  const app = createApp()
  if (middleware !== undefined) app.use(middleware)
  app.use(handler)
  return toWebHandler(app)
}

describe('Nuxt integration', () => {
  test('creates a Nitro-compatible handler for a catch-all server route', async () => {
    const implementation = defineServer(contract).implement({
      health: () => ({ status: 200, body: 'ok' }),
      users: {
        create: ({ body }) => ({ status: 201, body: { actor: 'anonymous', name: body.name } }),
      },
    })
    const handler = nuxtAdapter().mount(implementation)
    const fetch = webHandler(handler)

    expectTypeOf(handler).toEqualTypeOf<NuxtRouteHandler>()
    expectTypeOf(handler).toMatchTypeOf<EventHandler>()

    const getResult = await fetch(new Request('https://example.com/api/health'))
    expect(getResult.status).toBe(200)
    await expect(getResult.json()).resolves.toBe('ok')

    const postResult = await fetch(
      new Request('https://example.com/api/users', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ name: 'Ada' }),
      })
    )
    expect(postResult.status).toBe(201)
    await expect(postResult.json()).resolves.toEqual({ actor: 'anonymous', name: 'Ada' })
  })

  test('mounts implementation fragments', async () => {
    const fragment = defineServer(contract).implement(contract.routes.health, () => ({ status: 200, body: 'ok' }))
    const fetch = webHandler(nuxtAdapter().mount(fragment))

    const result = await fetch(new Request('https://example.com/api/health'))
    expect(result.status).toBe(200)
    await expect(result.json()).resolves.toBe('ok')

    const unrelated = await fetch(new Request('https://example.com/api/users'))
    expect(unrelated.status).toBe(404)
  })

  test('exposes the native H3 event and keeps contract route metadata separate', async () => {
    let contextInput: NuxtContextInput<typeof contract> | undefined
    const adapter = nuxtAdapter()
    const implementation = defineServer(contract, {
      context: adapter.context(({ nuxtEvent, request, route: routeMetadata }) => {
        contextInput = { nuxtEvent, request, route: routeMetadata } as NuxtContextInput<typeof contract>
        return { actor: String(nuxtEvent.context['actor'] ?? 'anonymous') }
      }),
    }).implement({
      health: () => ({ status: 200, body: 'ok' }),
      users: {
        create: ({ body, context }) => ({ status: 201, body: { actor: context.actor, name: body.name } }),
      },
    })
    const eventMiddleware = defineEventHandler((event) => {
      event.context['actor'] = 'Ada'
    })
    const fetch = webHandler(adapter.mount(implementation), eventMiddleware)

    const result = await fetch(
      new Request('https://example.com/api/users', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ name: 'Grace' }),
      })
    )

    await expect(result.json()).resolves.toEqual({ actor: 'Ada', name: 'Grace' })
    expect(contextInput?.request).toBeInstanceOf(Request)
    expect(contextInput?.nuxtEvent.context['actor']).toBe('Ada')
    expect(contextInput?.route).toEqual({ key: ['users', 'create'], method: 'POST', path: '/api/users' })
    expect(() => inProcessTransport(implementation as never)).toThrow(
      'Server requires the nuxt adapter, but was mounted with in-process'
    )
  })

  test('services HEAD through the contract GET route without a body', async () => {
    let method: string | undefined
    const adapter = nuxtAdapter()
    const implementation = defineServer(contract, {
      context: adapter.context(({ request }) => {
        method = request.method
        return {}
      }),
    }).implement(contract.routes.health, () => ({ status: 200, body: 'ok' }))

    const result = await webHandler(adapter.mount(implementation))(
      new Request('https://example.com/api/health', { method: 'HEAD' })
    )

    expect(result.status).toBe(200)
    expect(method).toBe('GET')
    expect(result.body).toBeNull()
  })

  test('passes native event context to the error hook and allows replacement responses', async () => {
    const onError = vi.fn<(input: NuxtServerErrorInput) => Response>(({ nuxtEvent, phase }) =>
      Response.json({ actor: nuxtEvent.context['actor'], phase }, { status: 503 })
    )
    const implementation = defineServer(contract).implement(contract.routes.health, ({ response }) =>
      Promise.reject(new Error('boom')).then(() => response(200, 'ok'))
    )
    const fetch = webHandler(
      nuxtAdapter({ onError }).mount(implementation),
      defineEventHandler((event) => {
        event.context['actor'] = 'Ada'
      })
    )

    const result = await fetch(new Request('https://example.com/api/health'))

    expect(result.status).toBe(503)
    await expect(result.json()).resolves.toEqual({ actor: 'Ada', phase: 'handler' })
    expect(onError).toHaveBeenCalledOnce()
  })

  test('rejects QUERY routes because Nitro only exposes HTTP methods', () => {
    const queryContract = defineContract({
      routes: { search: route.query('/search', { responses: { 200: response.json(z.string()) } }) },
    })
    const implementation = defineServer(queryContract).implement({
      search: () => ({ status: 200, body: 'result' }),
    })

    expect(() => nuxtAdapter().mount(implementation)).toThrow('Nuxt server routes do not support QUERY routes: search')
  })

  test('adapter defaults can be overridden per mount', async () => {
    const defaultError = vi.fn<() => Response>(() => Response.json('default', { status: 500 }))
    const mountedError = vi.fn<() => Response>(() => Response.json('mounted', { status: 502 }))
    const implementation = defineServer(contract).implement(contract.routes.health, ({ response }) =>
      Promise.reject(new Error('boom')).then(() => response(200, 'ok'))
    )
    const fetch = webHandler(nuxtAdapter({ onError: defaultError }).mount(implementation, { onError: mountedError }))

    const result = await fetch(new Request('https://example.com/api/health'))

    expect(result.status).toBe(502)
    await expect(result.json()).resolves.toBe('mounted')
    expect(defaultError).not.toHaveBeenCalled()
    expect(mountedError).toHaveBeenCalledOnce()
  })

  test('exports the native event type used by Nuxt request composables', () => {
    expectTypeOf<NuxtRequestEvent>().toMatchTypeOf<Parameters<EventHandler>[0]>()
  })
})
