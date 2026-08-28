import { defineContract, response, route } from '@hulla/api'
import { inProcessTransport } from '@hulla/api/in-process'
import { defineServer } from '@hulla/api/server'
import { Hono } from 'hono'
import { describe, expect, expectTypeOf, test, vi } from 'vitest'
import { z } from 'zod'
import { honoAdapter, type HonoContextInput, type HonoServerErrorInput, type HonoServerOptions } from '../src'

type TestEnv = {
  readonly Bindings: {
    readonly API_TOKEN: string
  }
  readonly Variables: {
    readonly actor: string
  }
}

const itemContract = defineContract({
  basePath: '/api',
  routes: {
    create: route.post('/items/:id', {
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
            token: z.string(),
          })
        ),
      },
    }),
  },
})

describe('Hono integration', () => {
  test('registers native routes on a caller-owned Hono app', async () => {
    const app = new Hono<TestEnv>()
    const middlewareOrder: string[] = []
    app.use('*', async (context, next) => {
      middlewareOrder.push('before')
      context.set('actor', 'Ada')
      await next()
      context.header('x-after', 'yes')
    })

    let nativeInput: HonoContextInput<typeof itemContract, TestEnv> | undefined
    const adapter = honoAdapter(app)
    const implementation = defineServer(itemContract, {
      context: adapter.context(async (input) => {
        expectTypeOf(input.honoContext).toEqualTypeOf<HonoContextInput<typeof itemContract, TestEnv>['honoContext']>()
        expectTypeOf(input.honoContext.env.API_TOKEN).toEqualTypeOf<string>()
        expectTypeOf(input.honoContext.get('actor')).toEqualTypeOf<string>()
        nativeInput = input as HonoContextInput<typeof itemContract, TestEnv>
        const originalBody = (await input.request.json()) as { readonly name: string }
        return {
          actor: input.honoContext.get('actor'),
          originalName: originalBody.name,
          token: input.honoContext.env.API_TOKEN,
        }
      }),
    }).implement({
      create: ({ body, context, headers, params, query }) => ({
        status: 201,
        body: {
          actor: context.actor,
          id: params.id,
          name: `${body.name}:${context.originalName}`,
          requestId: headers['x-request-id'],
          tags: typeof query.tag === 'string' ? [query.tag] : [...query.tag],
          token: context.token,
        },
      }),
    })

    const mounted = adapter.mount(implementation)
    app.use('*', async (_context, next) => {
      middlewareOrder.push('after')
      await next()
    })
    app.get('/outside', (context) => context.text('outside'))

    expect(mounted).toBe(app)
    expectTypeOf(mounted).toEqualTypeOf<typeof app>()
    const result = await app.request(
      '/api/items/item%201?tag=first&tag=second',
      {
        method: 'POST',
        headers: { 'content-type': 'application/json', 'x-request-id': 'request-1' },
        body: JSON.stringify({ name: 'Hono' }),
      },
      { API_TOKEN: 'secret' }
    )

    expect(result.status).toBe(201)
    expect(result.headers.get('x-after')).toBe('yes')
    await expect(result.json()).resolves.toEqual({
      actor: 'Ada',
      id: 'item 1',
      name: 'Hono:Hono',
      requestId: 'request-1',
      tags: ['first', 'second'],
      token: 'secret',
    })
    expect(middlewareOrder).toEqual(['before'])
    expect(nativeInput?.honoContext.req.param('id')).toBe('item 1')
    expect(nativeInput?.route).toEqual({ key: ['create'], method: 'POST', path: '/api/items/:id' })
    expect(() => inProcessTransport(implementation as never)).toThrow(
      'Server requires the hono adapter, but was mounted with in-process'
    )

    const outside = await app.request('/outside', undefined, { API_TOKEN: 'secret' })
    expect(outside.status).toBe(200)
    await expect(outside.text()).resolves.toBe('outside')
  })

  test('reuses a request body cached by earlier Hono middleware', async () => {
    const app = new Hono()
    let middlewareBody: unknown
    app.use('/api/*', async (context, next) => {
      middlewareBody = await context.req.json()
      await next()
    })
    honoAdapter(app).mount(
      defineServer(itemContract).implement({
        create: ({ body, headers, params, query }) => ({
          status: 201,
          body: {
            actor: 'none',
            id: params.id,
            name: body.name,
            requestId: headers['x-request-id'],
            tags: typeof query.tag === 'string' ? [query.tag] : [...query.tag],
            token: 'none',
          },
        }),
      })
    )

    const result = await app.request('/api/items/1?tag=one', {
      method: 'POST',
      headers: { 'content-type': 'application/json', 'x-request-id': 'request-2' },
      body: JSON.stringify({ name: 'cached' }),
    })

    expect(result.status).toBe(201)
    expect(middlewareBody).toEqual({ name: 'cached' })
    await expect(result.json()).resolves.toMatchObject({ name: 'cached' })
  })

  test('forwards Hono context to adapter defaults and mount error hooks', async () => {
    const errorContract = defineContract({
      routes: {
        fail: route.get('/fail', { responses: { 200: response.text() } }),
        mountFail: route.get('/mount-fail', { responses: { 200: response.text() } }),
      },
    })
    const defaultHook = vi.fn<(input: HonoServerErrorInput<TestEnv>) => Response>()
    const mountHook = vi.fn<(input: HonoServerErrorInput<TestEnv>) => Response>()
    const app = new Hono<TestEnv>()
    app.use('*', async (context, next) => {
      context.set('actor', 'Grace')
      await next()
    })
    const defaults: HonoServerOptions<TestEnv> = {
      onError: (input) => {
        expectTypeOf(input).toEqualTypeOf<HonoServerErrorInput<TestEnv>>()
        defaultHook(input)
        return new Response(`${input.honoContext.get('actor')}:default`, {
          status: input.defaultResponse.status,
        })
      },
    }
    const adapter = honoAdapter(app, defaults)
    const server = defineServer(errorContract)
    const fail = server.implement(errorContract.routes.fail, (): { readonly body: string; readonly status: 200 } => {
      throw new Error('default failure')
    })
    const mountFail = server.implement(
      errorContract.routes.mountFail,
      (): { readonly body: string; readonly status: 200 } => {
        throw new Error('mount failure')
      }
    )
    adapter.mount(fail)
    adapter.mount(mountFail, {
      onError: (input) => {
        mountHook(input)
        return new Response(`${input.honoContext.env.API_TOKEN}:mount`, {
          status: input.defaultResponse.status,
        })
      },
    })

    const defaultResult = await app.request('/fail', undefined, { API_TOKEN: 'secret' })
    const mountResult = await app.request('/mount-fail', undefined, { API_TOKEN: 'secret' })

    expect(defaultResult.status).toBe(500)
    await expect(defaultResult.text()).resolves.toBe('Grace:default')
    expect(mountResult.status).toBe(500)
    await expect(mountResult.text()).resolves.toBe('secret:mount')
    expect(defaultHook).toHaveBeenCalledWith(
      expect.objectContaining({
        phase: 'handler',
        route: { key: ['fail'], method: 'GET', path: '/fail' },
      })
    )
    expect(mountHook).toHaveBeenCalledWith(
      expect.objectContaining({
        phase: 'handler',
        route: { key: ['mountFail'], method: 'GET', path: '/mount-fail' },
      })
    )
  })

  test('supports QUERY routes through Hono native routing', async () => {
    const queryContract = defineContract({
      routes: { search: route.query('/search', { responses: { 200: response.text() } }) },
    })
    const implementation = defineServer(queryContract).implement({
      search: () => ({ status: 200, body: 'result' }),
    })
    const app = new Hono()
    honoAdapter(app).mount(implementation)
    const basedApp = new Hono().basePath('/v1')
    expect(honoAdapter(basedApp).mount(implementation)).toBe(basedApp)

    const result = await app.request('/search', { method: 'QUERY' })
    const basedResult = await basedApp.request('/v1/search', { method: 'QUERY' })

    expect(result.status).toBe(200)
    await expect(result.text()).resolves.toBe('result')
    expect(basedResult.status).toBe(200)
    await expect(basedResult.text()).resolves.toBe('result')
  })
})
