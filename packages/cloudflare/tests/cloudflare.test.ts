import { defineContract, response, route } from '@hulla/api'
import { inProcessTransport } from '@hulla/api/in-process'
import { defineServer } from '@hulla/api/server'
import { describe, expect, expectTypeOf, test, vi } from 'vitest'
import { z } from 'zod'
import {
  cloudflareAdapter,
  type CloudflareContextInput,
  type CloudflareExecutionContext,
  type CloudflareServerErrorInput,
  type CloudflareWorkerHandler,
} from '../src'

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

type WorkerExecutionContext = CloudflareExecutionContext & {
  readonly props: { readonly region: string }
}

function executionContext(region = 'eu'): WorkerExecutionContext {
  return {
    passThroughOnException: vi.fn<() => void>(),
    props: { region },
    waitUntil: vi.fn<(promise: Promise<unknown>) => void>(),
  }
}

describe('Cloudflare Workers integration', () => {
  test('creates a Module Worker fetch handler with native context', async () => {
    let contextInput: CloudflareContextInput<typeof contract, Env, WorkerExecutionContext> | undefined
    const adapter = cloudflareAdapter<Env, WorkerExecutionContext>()
    const implementation = defineServer(contract, {
      context: adapter.context((input) => {
        expectTypeOf(input.env).toEqualTypeOf<Env>()
        expectTypeOf(input.ctx).toEqualTypeOf<WorkerExecutionContext>()
        contextInput = input as CloudflareContextInput<typeof contract, Env, WorkerExecutionContext>
        input.ctx.waitUntil(Promise.resolve())
        return { region: input.ctx.props.region, token: input.env.API_TOKEN }
      }),
    }).implement({
      health: ({ context }) => ({
        status: 200,
        body: context.token === 'secret' && context.region === 'eu' ? 'ok' : 'ok',
      }),
      fail: () => ({ status: 200, body: 'ok' }),
    })
    const handler = adapter.mount(implementation)
    const request = new Request('https://worker.example/api/health')
    const env = { API_TOKEN: 'secret' }
    const ctx = executionContext()

    expectTypeOf(handler).toEqualTypeOf<CloudflareWorkerHandler<Env, WorkerExecutionContext>>()
    const result = await handler(request, env, ctx)

    expect(result.status).toBe(200)
    await expect(result.json()).resolves.toBe('ok')
    expect(contextInput?.request).toBe(request)
    expect(contextInput?.env).toBe(env)
    expect(contextInput?.ctx).toBe(ctx)
    expect(contextInput?.route).toEqual({ key: ['health'], method: 'GET', path: '/api/health' })
    expect(ctx.waitUntil).toHaveBeenCalledOnce()
    expect(() => inProcessTransport(implementation as never)).toThrow(
      'Server requires the cloudflare-workers adapter, but was mounted with in-process'
    )
  })

  test('forwards bindings and execution context to the error hook', async () => {
    const onError = vi.fn<(input: CloudflareServerErrorInput<Env>) => void>()
    const implementation = defineServer(contract).implement({
      health: () => ({ status: 200, body: 'ok' }),
      fail: (): { readonly body: 'ok'; readonly status: 200 } => {
        throw new Error('failure')
      },
    })
    const handler = cloudflareAdapter<Env>({
      onError: (input: CloudflareServerErrorInput<Env>) => {
        expectTypeOf(input).toEqualTypeOf<CloudflareServerErrorInput<Env>>()
        onError(input)
        return Response.json({ token: input.env.API_TOKEN }, { status: input.defaultResponse.status })
      },
    }).mount(implementation)
    const request = new Request('https://worker.example/api/fail')
    const env = { API_TOKEN: 'secret' }
    const ctx = executionContext()

    const result = await handler(request, env, ctx)

    expect(result.status).toBe(500)
    await expect(result.json()).resolves.toEqual({ token: 'secret' })
    expect(onError).toHaveBeenCalledWith(
      expect.objectContaining({
        env,
        ctx,
        phase: 'handler',
        request,
        route: { key: ['fail'], method: 'GET', path: '/api/fail' },
      })
    )
  })

  test('keeps native error context isolated for concurrent calls sharing a Request', async () => {
    const releases = new Map<string, () => void>()
    const adapter = cloudflareAdapter<Env>()
    const implementation = defineServer(contract, {
      context: adapter.context(({ env }) => ({ token: env.API_TOKEN })),
    }).implement({
      health: () => ({ status: 200, body: 'ok' }),
      fail: async ({ context }): Promise<{ readonly body: 'ok'; readonly status: 200 }> => {
        await new Promise<void>((resolve) => releases.set(context.token, resolve))
        throw new Error(context.token)
      },
    })
    const handler = adapter.mount(implementation, {
      onError: ({ env, defaultResponse }) =>
        Response.json({ token: env.API_TOKEN }, { status: defaultResponse.status }),
    })
    const request = new Request('https://worker.example/api/fail')

    const first = handler(request, { API_TOKEN: 'first' }, executionContext('first'))
    const second = handler(request, { API_TOKEN: 'second' }, executionContext('second'))
    releases.get('first')?.()
    await expect(first.then((response) => response.json())).resolves.toEqual({ token: 'first' })
    releases.get('second')?.()
    await expect(second.then((response) => response.json())).resolves.toEqual({ token: 'second' })
  })

  test('supports all methods accepted by the Worker Fetch runtime', async () => {
    const queryContract = defineContract({
      routes: { search: route.query('/search', { responses: { 200: response.json(z.string()) } }) },
    })
    const implementation = defineServer(queryContract).implement({
      search: () => ({ status: 200, body: 'result' }),
    })
    const handler = cloudflareAdapter().mount(implementation)
    const result = await handler(
      new Request('https://worker.example/search', { method: 'QUERY' }),
      {},
      executionContext()
    )

    expect(result.status).toBe(200)
    await expect(result.json()).resolves.toBe('result')
  })
})
