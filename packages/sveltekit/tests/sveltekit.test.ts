import { defineContract, response, route, router } from '@hulla/api'
import { inProcessTransport } from '@hulla/api/in-process'
import { defineServer } from '@hulla/api/server'
import type { RequestHandler } from '@sveltejs/kit'
import { describe, expect, expectTypeOf, test, vi } from 'vitest'
import { z } from 'zod'
import {
  svelteKitAdapter,
  type SvelteKitContextInput,
  type SvelteKitRequestEvent,
  type SvelteKitRouteHandler,
  type SvelteKitServerErrorInput,
} from '../src/server'

declare global {
  namespace App {
    // oxlint-disable-next-line typescript/consistent-type-definitions -- SvelteKit locals require declaration merging.
    interface Locals {
      actor?: string
    }
  }
}

const contract = defineContract({
  basePath: '/api',
  routes: {
    health: route.get('/health', { responses: { 200: response.json(z.literal('ok')) } }),
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

function requestEvent(request: Request, overrides: Partial<SvelteKitRequestEvent> = {}): SvelteKitRequestEvent {
  return {
    cookies: {},
    fetch,
    getClientAddress: () => '127.0.0.1',
    isDataRequest: false,
    isRemoteRequest: false,
    isSubRequest: false,
    locals: {},
    params: {},
    platform: undefined,
    request,
    route: { id: '/api/[...hulla]' },
    setHeaders: () => {},
    tracing: {},
    url: new URL(request.url),
    ...overrides,
  } as unknown as SvelteKitRequestEvent
}

describe('SvelteKit integration', () => {
  test('creates a handler compatible with SvelteKit endpoint exports', async () => {
    const implementation = defineServer(contract).implement({
      health: () => ({ status: 200, body: 'ok' }),
      users: {
        create: ({ body }) => ({ status: 201, body: { id: 'user-1', name: body.name } }),
      },
    })
    const handler = svelteKitAdapter().mount(implementation)

    expectTypeOf(handler).toEqualTypeOf<SvelteKitRouteHandler>()
    expectTypeOf(handler).toMatchTypeOf<RequestHandler>()

    const getResult = await handler(requestEvent(new Request('https://example.com/api/health')))
    expect(getResult.status).toBe(200)
    await expect(getResult.json()).resolves.toBe('ok')

    const postResult = await handler(
      requestEvent(
        new Request('https://example.com/api/users', {
          method: 'POST',
          headers: { 'content-type': 'application/json' },
          body: JSON.stringify({ name: 'Ada' }),
        })
      )
    )
    expect(postResult.status).toBe(201)
    await expect(postResult.json()).resolves.toEqual({ id: 'user-1', name: 'Ada' })
  })

  test('mounts an implementation fragment', async () => {
    const fragment = defineServer(contract).implement(contract.routes.health, () => ({ status: 200, body: 'ok' }))
    const handler = svelteKitAdapter().mount(fragment)

    const result = await handler(requestEvent(new Request('https://example.com/api/health')))
    expect(result.status).toBe(200)
    await expect(result.json()).resolves.toBe('ok')

    const unrelated = await handler(requestEvent(new Request('https://example.com/api/users')))
    expect(unrelated.status).toBe(404)
  })

  test('services HEAD requests through the contract GET route', async () => {
    let dispatchedMethod: string | undefined
    const adapter = svelteKitAdapter()
    const implementation = defineServer(contract, {
      context: adapter.context(({ request }) => {
        dispatchedMethod = request.method
        return {}
      }),
    }).implement(contract.routes.health, () => ({ status: 200, body: 'ok' }))
    const handler = adapter.mount(implementation)

    const result = await handler(requestEvent(new Request('https://example.com/api/health', { method: 'HEAD' })))

    expect(result.status).toBe(200)
    expect(dispatchedMethod).toBe('GET')
    expect(result.body).toBeNull()
  })

  test('exposes the complete native request event without replacing contract route metadata', async () => {
    let contextInput: SvelteKitContextInput<typeof contract> | undefined
    const adapter = svelteKitAdapter()
    const platform = { runtime: 'node' }
    const implementation = defineServer(contract, {
      context: adapter.context(({ request, route: routeMetadata, svelteKitEvent }) => {
        contextInput = { request, route: routeMetadata, svelteKitEvent } as SvelteKitContextInput<typeof contract>
        return {
          actor: svelteKitEvent.locals.actor,
          catchAll: svelteKitEvent.params['hulla'],
        }
      }),
    }).implement({
      health: ({ context }) => ({
        status: 200,
        body: context.actor === 'Ada' && context.catchAll === 'health' ? 'ok' : 'ok',
      }),
      users: {
        create: ({ body }) => ({ status: 201, body: { id: 'user-1', name: body.name } }),
      },
    })
    const handler = adapter.mount(implementation)
    const request = new Request('https://example.com/api/health')
    const event = requestEvent(request, {
      getClientAddress: () => '203.0.113.4',
      locals: { actor: 'Ada' },
      params: { hulla: 'health' },
      platform,
      route: { id: '/api/[...hulla]' },
    } as Partial<SvelteKitRequestEvent>)

    await handler(event)

    expect(contextInput?.request).toBe(request)
    expect(contextInput?.svelteKitEvent).toBe(event)
    expect(contextInput?.svelteKitEvent.getClientAddress()).toBe('203.0.113.4')
    expect(contextInput?.svelteKitEvent.platform).toBe(platform)
    expect(contextInput?.svelteKitEvent.route.id).toBe('/api/[...hulla]')
    expect(contextInput?.route).toEqual({ key: ['health'], method: 'GET', path: '/api/health' })
    expect(() => inProcessTransport(implementation as never)).toThrow(
      'Server requires the sveltekit adapter, but was mounted with in-process'
    )
  })

  test('forwards the native request event to the adapter error hook', async () => {
    const onError = vi.fn<(input: SvelteKitServerErrorInput) => Response>(({ defaultResponse }) =>
      Response.json({ replaced: true }, { status: defaultResponse.status })
    )
    const implementation = defineServer(contract).implement({
      health: (): { readonly body: 'ok'; readonly status: 200 } => {
        throw new Error('failure')
      },
      users: {
        create: ({ body }) => ({ status: 201, body: { id: 'user-1', name: body.name } }),
      },
    })
    const handler = svelteKitAdapter({ onError }).mount(implementation)
    const request = new Request('https://example.com/api/health')
    const event = requestEvent(request, { locals: { actor: 'Ada' }, params: { hulla: 'health' } })
    const result = await handler(event)

    expect(result.status).toBe(500)
    await expect(result.json()).resolves.toEqual({ replaced: true })
    expect(onError).toHaveBeenCalledWith(
      expect.objectContaining({
        phase: 'handler',
        request,
        route: expect.objectContaining({ key: ['health'] }),
        svelteKitEvent: event,
      })
    )
  })

  test('rejects QUERY routes before creating the endpoint handler', () => {
    const queryContract = defineContract({
      routes: { search: route.query('/search', { responses: { 200: response.json(z.string()) } }) },
    })
    const implementation = defineServer(queryContract).implement({
      search: () => ({ status: 200, body: 'result' }),
    })

    expect(() => svelteKitAdapter().mount(implementation)).toThrow(
      'SvelteKit endpoints do not support QUERY routes: search'
    )
  })
})
