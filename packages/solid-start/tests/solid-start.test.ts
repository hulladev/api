import { defineContract, response, route, router } from '@hulla/api'
import { inProcessTransport } from '@hulla/api/in-process'
import { defineServer } from '@hulla/api/server'
import type { APIHandler } from '@solidjs/start/server'
import { describe, expect, expectTypeOf, test, vi } from 'vitest'
import { z } from 'zod'
import {
  solidStartAdapter,
  type SolidStartAPIEvent,
  type SolidStartContextInput,
  type SolidStartRouteHandler,
  type SolidStartServerErrorInput,
} from '../src'

declare global {
  namespace App {
    // oxlint-disable-next-line typescript/consistent-type-definitions -- SolidStart locals require declaration merging.
    interface RequestEventLocals {
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

function apiEvent(request: Request, overrides: Partial<SolidStartAPIEvent> = {}): SolidStartAPIEvent {
  return {
    locals: {},
    nativeEvent: {} as SolidStartAPIEvent['nativeEvent'],
    params: {},
    request,
    response: { headers: new Headers() },
    ...overrides,
  }
}

describe('SolidStart integration', () => {
  test('creates a handler compatible with SolidStart API route exports', async () => {
    const implementation = defineServer(contract).implement({
      health: () => ({ status: 200, body: 'ok' }),
      users: {
        create: ({ body }) => ({ status: 201, body: { id: 'user-1', name: body.name } }),
      },
    })
    const handler = solidStartAdapter().mount(implementation)

    expectTypeOf(handler).toEqualTypeOf<SolidStartRouteHandler>()
    expectTypeOf(handler).toMatchTypeOf<APIHandler>()

    const getResult = await handler(apiEvent(new Request('https://example.com/api/health')))
    expect(getResult.status).toBe(200)
    await expect(getResult.json()).resolves.toBe('ok')

    const postResult = await handler(
      apiEvent(
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
    const handler = solidStartAdapter().mount(fragment)

    const result = await handler(apiEvent(new Request('https://example.com/api/health')))
    expect(result.status).toBe(200)
    await expect(result.json()).resolves.toBe('ok')

    const unrelated = await handler(apiEvent(new Request('https://example.com/api/users')))
    expect(unrelated.status).toBe(404)
  })

  test('services SolidStart synthesized HEAD requests through the contract GET route', async () => {
    let dispatchedMethod: string | undefined
    const adapter = solidStartAdapter()
    const implementation = defineServer(contract, {
      context: adapter.context(({ request }) => {
        dispatchedMethod = request.method
        return {}
      }),
    }).implement(contract.routes.health, () => ({ status: 200, body: 'ok' }))
    const handler = adapter.mount(implementation)

    const result = await handler(apiEvent(new Request('https://example.com/api/health', { method: 'HEAD' })))

    expect(result.status).toBe(200)
    expect(dispatchedMethod).toBe('GET')
    expect(result.body).toBeNull()
  })

  test('exposes the complete native API event without replacing contract route metadata', async () => {
    let contextInput: SolidStartContextInput<typeof contract> | undefined
    const adapter = solidStartAdapter()
    const nativeEvent = { marker: 'h3' } as unknown as SolidStartAPIEvent['nativeEvent']
    const responseHeaders = new Headers()
    const implementation = defineServer(contract, {
      context: adapter.context(({ request, route: routeMetadata, solidStartEvent }) => {
        contextInput = { request, route: routeMetadata, solidStartEvent } as SolidStartContextInput<typeof contract>
        return {
          actor: solidStartEvent.locals.actor,
          catchAll: solidStartEvent.params['hulla'],
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
    const event = apiEvent(request, {
      clientAddress: '203.0.113.4',
      locals: { actor: 'Ada' },
      nativeEvent,
      params: { hulla: 'health' },
      response: { headers: responseHeaders },
    })

    await handler(event)

    expect(contextInput?.request).toBe(request)
    expect(contextInput?.solidStartEvent).toBe(event)
    expect(contextInput?.solidStartEvent.nativeEvent).toBe(nativeEvent)
    expect(contextInput?.solidStartEvent.response.headers).toBe(responseHeaders)
    expect(contextInput?.solidStartEvent.clientAddress).toBe('203.0.113.4')
    expect(contextInput?.route).toEqual({ key: ['health'], method: 'GET', path: '/api/health' })
    expect(() => inProcessTransport(implementation as never)).toThrow(
      'Server requires the solid-start adapter, but was mounted with in-process'
    )
  })

  test('forwards the native API event to the adapter error hook', async () => {
    const onError = vi.fn<(input: SolidStartServerErrorInput) => Response>(({ defaultResponse }) =>
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
    const handler = solidStartAdapter({ onError }).mount(implementation)
    const request = new Request('https://example.com/api/health')
    const event = apiEvent(request, { locals: { actor: 'Ada' }, params: { hulla: 'health' } })
    const result = await handler(event)

    expect(result.status).toBe(500)
    await expect(result.json()).resolves.toEqual({ replaced: true })
    expect(onError).toHaveBeenCalledWith(
      expect.objectContaining({
        phase: 'handler',
        request,
        solidStartEvent: event,
        route: expect.objectContaining({ key: ['health'] }),
      })
    )
  })

  test('rejects QUERY routes before creating the API handler', () => {
    const queryContract = defineContract({
      routes: { search: route.query('/search', { responses: { 200: response.json(z.string()) } }) },
    })
    const implementation = defineServer(queryContract).implement({
      search: () => ({ status: 200, body: 'result' }),
    })

    expect(() => solidStartAdapter().mount(implementation)).toThrow(
      'SolidStart API routes do not support QUERY routes: search'
    )
  })
})
