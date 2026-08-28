import { defineContract, request, response, route } from '@hulla/api'
import { inProcessTransport } from '@hulla/api/in-process'
import { defineServer } from '@hulla/api/server'
import { describe, expect, expectTypeOf, test, vi } from 'vitest'
import { z } from 'zod'
import {
  netlifyFunctionsAdapter,
  type NetlifyContext,
  type NetlifyContextInput,
  type NetlifyFunction,
  type NetlifyServerErrorInput,
} from '../src'

const contract = defineContract({
  basePath: '/api',
  routes: {
    create: route.post('/items/:id', {
      params: z.object({ id: z.string() }),
      query: z.object({ tag: z.string() }),
      body: request.json(z.object({ name: z.string() })),
      responses: {
        201: response.json(z.object({ id: z.string(), name: z.string(), requestId: z.string(), tag: z.string() })),
      },
    }),
    stream: route.get('/stream', {
      responses: { 200: response.stream({ contentType: 'application/octet-stream' }) },
    }),
    fail: route.get('/fail', { responses: { 200: response.text() } }),
  },
})

function netlifyContext(overrides: Partial<NetlifyContext> = {}): NetlifyContext {
  return {
    params: { id: 'item-1' },
    requestId: 'request-123',
    waitUntil: vi.fn<(promise: Promise<unknown>) => void>(),
    ...overrides,
  } as unknown as NetlifyContext
}

describe('Netlify Functions integration', () => {
  test('handles Web requests and exposes native Netlify context', async () => {
    let contextInput: NetlifyContextInput<typeof contract> | undefined
    const adapter = netlifyFunctionsAdapter()
    const implementation = defineServer(contract, {
      context: adapter.context((input) => {
        expectTypeOf(input.request).toEqualTypeOf<Request>()
        expectTypeOf(input.netlifyContext).toEqualTypeOf<NetlifyContext>()
        contextInput = input as NetlifyContextInput<typeof contract>
        input.netlifyContext.waitUntil(Promise.resolve())
        return { requestId: input.netlifyContext.requestId }
      }),
    }).implement({
      create: ({ body, context, params, query }) => ({
        status: 201,
        body: { id: params.id, name: body.name, requestId: context.requestId, tag: query.tag },
      }),
      stream: () => ({
        status: 200,
        body: (async function* () {
          yield new Uint8Array([1, 2])
          yield new Uint8Array([3, 4])
        })(),
      }),
      fail: () => ({ status: 200, body: 'ok' }),
    })
    const handler = adapter.mount(implementation)
    const requestValue = new Request('https://example.netlify.app/api/items/item%201?tag=typescript', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ name: 'Compiler' }),
    })
    const nativeContext = netlifyContext()

    expectTypeOf(handler).toEqualTypeOf<NetlifyFunction>()
    const result = await handler(requestValue, nativeContext)

    expect(result.status).toBe(201)
    await expect(result.json()).resolves.toEqual({
      id: 'item 1',
      name: 'Compiler',
      requestId: 'request-123',
      tag: 'typescript',
    })
    expect(contextInput?.request).toBe(requestValue)
    expect(contextInput?.netlifyContext).toBe(nativeContext)
    expect(contextInput?.route).toEqual({ key: ['create'], method: 'POST', path: '/api/items/:id' })
    expect(nativeContext.waitUntil).toHaveBeenCalledOnce()
    expect(() => inProcessTransport(implementation as never)).toThrow(
      'Server requires the netlify-functions adapter, but was mounted with in-process'
    )
  })

  test('preserves streamed responses and routing failures', async () => {
    const implementation = defineServer(contract).implement({
      create: ({ body, params, query }) => ({
        status: 201,
        body: { id: params.id, name: body.name, requestId: 'none', tag: query.tag },
      }),
      stream: () => ({
        status: 200,
        body: (async function* () {
          yield new Uint8Array([1, 2])
          yield new Uint8Array([3, 4])
        })(),
      }),
      fail: () => ({ status: 200, body: 'ok' }),
    })
    const handler = netlifyFunctionsAdapter().mount(implementation)

    const stream = await handler(new Request('https://example.netlify.app/api/stream'), netlifyContext())
    expect(new Uint8Array(await stream.arrayBuffer())).toEqual(new Uint8Array([1, 2, 3, 4]))

    const missing = await handler(new Request('https://example.netlify.app/api/missing'), netlifyContext())
    expect(missing.status).toBe(404)
    await expect(missing.json()).resolves.toEqual(expect.objectContaining({ code: 'route-not-found' }))
  })

  test('forwards native context to per-mount error hooks', async () => {
    const sharedError = vi.fn<(input: NetlifyServerErrorInput) => void>()
    const mountError = vi.fn<(input: NetlifyServerErrorInput) => void>()
    const adapter = netlifyFunctionsAdapter({ onError: sharedError })
    const implementation = defineServer(contract).implement({
      create: ({ body, params, query }) => ({
        status: 201,
        body: { id: params.id, name: body.name, requestId: 'none', tag: query.tag },
      }),
      stream: () => ({
        status: 200,
        body: (async function* () {
          yield new Uint8Array()
        })(),
      }),
      fail: (): { readonly status: 200; readonly body: string } => {
        throw new Error('failure')
      },
    })
    const nativeContext = netlifyContext({ requestId: 'error-request' })
    const handler = adapter.mount(implementation, {
      onError(input) {
        expectTypeOf(input).toEqualTypeOf<NetlifyServerErrorInput>()
        mountError(input)
        return new Response('replaced', {
          status: 503,
          headers: { 'x-error-phase': input.phase },
        })
      },
    })

    const result = await handler(new Request('https://example.netlify.app/api/fail'), nativeContext)

    expect(result.status).toBe(503)
    expect(result.headers.get('x-error-phase')).toBe('handler')
    await expect(result.text()).resolves.toBe('replaced')
    expect(sharedError).not.toHaveBeenCalled()
    expect(mountError).toHaveBeenCalledWith(
      expect.objectContaining({
        netlifyContext: nativeContext,
        phase: 'handler',
        route: { key: ['fail'], method: 'GET', path: '/api/fail' },
      })
    )
  })
})
