import { defineContract, response, route } from '@hulla/api'
import { inProcessTransport } from '@hulla/api/in-process'
import { defineServer } from '@hulla/api/server'
import { describe, expect, expectTypeOf, test, vi } from 'vitest'
import { z } from 'zod'
import { cloudflareAdapter } from '../src'
import {
  cloudflarePagesAdapter,
  type CloudflarePagesContextInput,
  type CloudflarePagesEventContext,
  type CloudflarePagesFunction,
  type CloudflarePagesServerErrorInput,
} from '../src/pages'

const contract = defineContract({
  basePath: '/api',
  routes: {
    health: route.get('/health', { responses: { 200: response.json(z.literal('ok')) } }),
    fail: route.get('/fail', { responses: { 200: response.json(z.literal('ok')) } }),
  },
})

type Env = {
  readonly API_TOKEN: string
}

type Params = 'hulla' | 'locale'

type Data = {
  readonly actor: string
}

function eventContext(
  request: Request,
  overrides: Partial<CloudflarePagesEventContext<Env, Params, Data>> = {}
): CloudflarePagesEventContext<Env, Params, Data> {
  return {
    request,
    functionPath: '/api/[[hulla]]',
    waitUntil: vi.fn<(promise: Promise<unknown>) => void>(),
    passThroughOnException: vi.fn<() => void>(),
    next: vi.fn<(input?: Request | string, init?: RequestInit) => Promise<Response>>(async () => new Response('asset')),
    env: {
      API_TOKEN: 'secret',
      ASSETS: { fetch: vi.fn<typeof fetch>(async () => new Response('asset')) },
    },
    params: { hulla: ['health'], locale: 'en' },
    data: { actor: 'Ada' },
    ...overrides,
  }
}

describe('Cloudflare Pages Functions integration', () => {
  test('creates a Pages Function with native event context', async () => {
    let contextInput: CloudflarePagesContextInput<typeof contract, Env, Params, Data> | undefined
    const adapter = cloudflarePagesAdapter<Env, Params, Data>()
    const implementation = defineServer(contract, {
      context: adapter.context((input) => {
        expectTypeOf(input.env.API_TOKEN).toEqualTypeOf<string>()
        expectTypeOf(input.env.ASSETS.fetch).toEqualTypeOf<typeof fetch>()
        expectTypeOf(input.params.hulla).toEqualTypeOf<string | string[]>()
        expectTypeOf(input.data.actor).toEqualTypeOf<string>()
        contextInput = input as CloudflarePagesContextInput<typeof contract, Env, Params, Data>
        input.waitUntil(Promise.resolve())
        return { actor: input.data.actor, token: input.env.API_TOKEN }
      }),
    }).implement({
      health: ({ context }) => {
        if (context.actor !== 'Ada' || context.token !== 'secret') throw new Error('Missing Pages context')
        return { status: 200, body: 'ok' }
      },
      fail: () => ({ status: 200, body: 'ok' }),
    })
    const handler = adapter.mount(implementation)
    const request = new Request('https://pages.example/api/health')
    const nativeContext = eventContext(request)

    expectTypeOf(handler).toEqualTypeOf<CloudflarePagesFunction<Env, Params, Data>>()
    const result = await handler(nativeContext)

    expect(result.status).toBe(200)
    await expect(result.json()).resolves.toBe('ok')
    expect(contextInput?.request).toBe(request)
    expect(contextInput?.env).toBe(nativeContext.env)
    expect(contextInput?.params).toBe(nativeContext.params)
    expect(contextInput?.data).toBe(nativeContext.data)
    expect(contextInput?.functionPath).toBe('/api/[[hulla]]')
    expect(contextInput?.next).toBe(nativeContext.next)
    expect(contextInput?.route).toEqual({ key: ['health'], method: 'GET', path: '/api/health' })
    expect(nativeContext.waitUntil).toHaveBeenCalledOnce()
    expect(() => inProcessTransport(implementation as never)).toThrow(
      'Server requires the cloudflare-pages adapter, but was mounted with in-process'
    )
    expect(() => cloudflareAdapter().mount(implementation as never)).toThrow(
      'Server requires the cloudflare-pages adapter, but was mounted with cloudflare-workers'
    )
  })

  test('forwards the complete event context to the error hook', async () => {
    const onError = vi.fn<(input: CloudflarePagesServerErrorInput<Env, Params, Data>) => void>()
    const implementation = defineServer(contract).implement({
      health: () => ({ status: 200, body: 'ok' }),
      fail: (): { readonly body: 'ok'; readonly status: 200 } => {
        throw new Error('failure')
      },
    })
    const handler = cloudflarePagesAdapter<Env, Params, Data>({
      onError(input) {
        expectTypeOf(input).toEqualTypeOf<CloudflarePagesServerErrorInput<Env, Params, Data>>()
        onError(input)
        return Response.json(
          { actor: input.data.actor, token: input.env.API_TOKEN },
          { status: input.defaultResponse.status }
        )
      },
    }).mount(implementation)
    const request = new Request('https://pages.example/api/fail')
    const nativeContext = eventContext(request)

    const result = await handler(nativeContext)

    expect(result.status).toBe(500)
    await expect(result.json()).resolves.toEqual({ actor: 'Ada', token: 'secret' })
    expect(onError).toHaveBeenCalledWith(
      expect.objectContaining({
        request,
        env: nativeContext.env,
        params: nativeContext.params,
        data: nativeContext.data,
        next: nativeContext.next,
        phase: 'handler',
        route: { key: ['fail'], method: 'GET', path: '/api/fail' },
      })
    )
  })

  test('keeps file-routing fallback explicit when the contract does not match', async () => {
    const implementation = defineServer(contract).implement({
      health: () => ({ status: 200, body: 'ok' }),
      fail: () => ({ status: 200, body: 'ok' }),
    })
    const nativeContext = eventContext(new Request('https://pages.example/api/missing'))

    const result = await cloudflarePagesAdapter<Env, Params, Data>().mount(implementation)(nativeContext)

    expect(result.status).toBe(404)
    await expect(result.json()).resolves.toEqual(expect.objectContaining({ code: 'route-not-found' }))
    expect(nativeContext.next).not.toHaveBeenCalled()
    expect(nativeContext.env.ASSETS.fetch).not.toHaveBeenCalled()
  })

  test('accepts custom methods through a generic onRequest export', async () => {
    const queryContract = defineContract({
      routes: { search: route.query('/search', { responses: { 200: response.json(z.string()) } }) },
    })
    const implementation = defineServer(queryContract).implement({
      search: () => ({ status: 200, body: 'result' }),
    })
    const request = new Request('https://pages.example/search', { method: 'QUERY' })
    const result = await cloudflarePagesAdapter<Env, Params, Data>().mount(implementation)(eventContext(request))

    expect(result.status).toBe(200)
    await expect(result.json()).resolves.toBe('result')
  })
})
