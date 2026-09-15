import { defineContract, response, route, router } from '@hulla/api'
import { inProcessTransport } from '@hulla/api/in-process'
import { defineServer } from '@hulla/api/server'
import { H3, type EventHandler } from 'h3'
import { describe, expect, expectTypeOf, test, vi } from 'vitest'
import { z } from 'zod'
import {
  h3Adapter,
  type H3ContextInput,
  type H3Event,
  type H3Handler,
  type H3ServerErrorInput,
  type H3ServerOptions,
} from '../src'

const contract = defineContract({
  basePath: '/api',
  routes: {
    health: route.get('/health', { responses: { 200: response.text() } }),
    items: router('/items', {
      routes: {
        create: route.post('/:id', {
          params: z.object({ id: z.string() }),
          query: z.object({ tag: z.union([z.string(), z.array(z.string())]) }),
          headers: z.object({ 'x-request-id': z.string() }),
          body: z.object({ name: z.string() }),
          responses: {
            201: response.json(
              z.object({
                actor: z.string(),
                id: z.string(),
                name: z.string(),
                requestId: z.string(),
                tags: z.array(z.string()),
              })
            ),
          },
        }),
      },
    }),
  },
})

describe('H3 integration', () => {
  test('registers native routes on a caller-owned H3 app', async () => {
    const app = new H3()
    app.use(async (event, next) => {
      event.context['actor'] = 'Ada'
      const result = await next()
      if (result instanceof Response) result.headers.set('x-after', 'yes')
      return result
    })

    let nativeInput: H3ContextInput<typeof contract> | undefined
    const adapter = h3Adapter(app)
    const implementation = defineServer(contract, {
      context: adapter.context(async (input) => {
        expectTypeOf(input.h3Event).toEqualTypeOf<H3Event>()
        nativeInput = input as H3ContextInput<typeof contract>
        const originalBody = (await input.request.json()) as { readonly name: string }
        return {
          actor: String(input.h3Event.context['actor']),
          originalName: originalBody.name,
        }
      }),
    }).implement({
      health: () => ({ status: 200, body: 'ok' }),
      items: {
        create: ({ body, context, headers, params, query }) => ({
          status: 201,
          body: {
            actor: context.actor,
            id: params.id,
            name: `${body.name}:${context.originalName}`,
            requestId: headers['x-request-id'],
            tags: typeof query.tag === 'string' ? [query.tag] : [...query.tag],
          },
        }),
      },
    })

    const mounted = adapter.mount(implementation, { preserveRequestBody: true })
    app.get('/outside', () => 'outside')

    expect(mounted).toBe(app)
    expectTypeOf(mounted).toEqualTypeOf<typeof app>()
    const result = await app.request('/api/items/item%201?tag=first&tag=second', {
      method: 'POST',
      headers: { 'content-type': 'application/json', 'x-request-id': 'request-1' },
      body: JSON.stringify({ name: 'H3' }),
    })

    expect(result.status).toBe(201)
    expect(result.headers.get('x-after')).toBe('yes')
    await expect(result.json()).resolves.toEqual({
      actor: 'Ada',
      id: 'item 1',
      name: 'H3:H3',
      requestId: 'request-1',
      tags: ['first', 'second'],
    })
    expect(nativeInput?.h3Event.context.params).toEqual({ id: 'item%201' })
    expect(nativeInput?.route).toEqual({ key: ['items', 'create'], method: 'POST', path: '/api/items/:id' })
    expect(() => inProcessTransport(implementation as never)).toThrow(
      'Server requires the h3 adapter, but was mounted with in-process'
    )

    const outside = await app.request('/outside')
    expect(outside.status).toBe(200)
    await expect(outside.text()).resolves.toBe('outside')
  })

  test('mounts implementation fragments without intercepting unrelated routes', async () => {
    const app = new H3()
    const fragment = defineServer(contract).implement(contract.routes.health, () => ({ status: 200, body: 'ok' }))

    h3Adapter(app).mount(fragment)

    const result = await app.request('/api/health')
    const unrelated = await app.request('/api/items/1')
    expect(result.status).toBe(200)
    await expect(result.text()).resolves.toBe('ok')
    expect(unrelated.status).toBe(404)
  })

  test('passes native event context to error hooks and supports per-mount overrides', async () => {
    const errorContract = defineContract({
      routes: {
        defaultFailure: route.get('/default-failure', { responses: { 200: response.text() } }),
        mountFailure: route.get('/mount-failure', { responses: { 200: response.text() } }),
      },
    })
    const defaultHook = vi.fn<(input: H3ServerErrorInput) => Response>()
    const mountHook = vi.fn<(input: H3ServerErrorInput) => Response>()
    const app = new H3()
    app.use((event) => {
      event.context['actor'] = 'Grace'
    })
    const defaults: H3ServerOptions = {
      onError: (input) => {
        expectTypeOf(input).toEqualTypeOf<H3ServerErrorInput>()
        defaultHook(input)
        return new Response(`${input.h3Event.context['actor']}:default`, {
          status: input.defaultResponse.status,
        })
      },
    }
    const adapter = h3Adapter(app, defaults)
    const server = defineServer(errorContract)
    const defaultFailure = server.implement(
      errorContract.routes.defaultFailure,
      (): { readonly body: string; readonly status: 200 } => {
        throw new Error('default failure')
      }
    )
    const mountFailure = server.implement(
      errorContract.routes.mountFailure,
      (): { readonly body: string; readonly status: 200 } => {
        throw new Error('mount failure')
      }
    )
    adapter.mount(defaultFailure)
    adapter.mount(mountFailure, {
      onError: (input) => {
        mountHook(input)
        return new Response('mount', { status: input.defaultResponse.status })
      },
    })

    const defaultResult = await app.request('/default-failure')
    const mountResult = await app.request('/mount-failure')

    expect(defaultResult.status).toBe(500)
    await expect(defaultResult.text()).resolves.toBe('Grace:default')
    expect(mountResult.status).toBe(500)
    await expect(mountResult.text()).resolves.toBe('mount')
    expect(defaultHook).toHaveBeenCalledWith(
      expect.objectContaining({
        phase: 'handler',
        route: { key: ['defaultFailure'], method: 'GET', path: '/default-failure' },
      })
    )
    expect(mountHook).toHaveBeenCalledWith(
      expect.objectContaining({
        phase: 'handler',
        route: { key: ['mountFailure'], method: 'GET', path: '/mount-failure' },
      })
    )
  })

  test('supports QUERY and H3 HEAD fallback through native routing', async () => {
    const methodContract = defineContract({
      routes: {
        read: route.get('/read', { responses: { 200: response.text() } }),
        search: route.query('/search', { responses: { 200: response.text() } }),
      },
    })
    let method: string | undefined
    const app = new H3()
    const adapter = h3Adapter(app)
    const implementation = defineServer(methodContract, {
      context: adapter.context(({ request }) => {
        method = request.method
        return {}
      }),
    }).implement({
      read: () => ({ status: 200, body: 'read' }),
      search: () => ({ status: 200, body: 'result' }),
    })
    adapter.mount(implementation)

    const queryResult = await app.request('/search', { method: 'QUERY' })
    expect(queryResult.status).toBe(200)
    await expect(queryResult.text()).resolves.toBe('result')

    const headResult = await app.request('/read', { method: 'HEAD' })
    expect(headResult.status).toBe(200)
    expect(headResult.body).toBeNull()
    expect(method).toBe('HEAD')
  })

  test('exports native H3 handler and event types', () => {
    expectTypeOf<H3Handler>().toMatchTypeOf<EventHandler>()
    expectTypeOf<H3Event>().toEqualTypeOf<Parameters<EventHandler>[0]>()
  })
})
