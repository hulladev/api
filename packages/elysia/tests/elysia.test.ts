import { defineContract, response, route } from '@hulla/api'
import { inProcessTransport } from '@hulla/api/in-process'
import { defineServer } from '@hulla/api/server'
import { Elysia } from 'elysia'
import { describe, expect, expectTypeOf, test, vi } from 'vitest'
import { z } from 'zod'
import { elysiaAdapter, type ElysiaContextInput, type ElysiaServerErrorInput, type ElysiaServerOptions } from '../src'

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
          })
        ),
      },
    }),
  },
})

describe('Elysia integration', () => {
  test('registers native routes on a caller-owned Elysia app', async () => {
    const app = new Elysia()
      .derive(({ request }) => ({ actor: request.headers.get('x-actor') ?? 'anonymous' }))
      .decorate('serviceName', 'elysia')
    let nativeInput: ElysiaContextInput<typeof itemContract, typeof app> | undefined
    const adapter = elysiaAdapter(app)
    const implementation = defineServer(itemContract, {
      context: adapter.context(async (input) => {
        expectTypeOf(input.elysiaContext.actor).toEqualTypeOf<string>()
        expectTypeOf(input.elysiaContext.serviceName).toEqualTypeOf<string>()
        nativeInput = input as ElysiaContextInput<typeof itemContract, typeof app>
        const originalBody = (await input.request.json()) as { readonly name: string }
        return {
          actor: input.elysiaContext.actor,
          originalName: originalBody.name,
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
        },
      }),
    })

    const mounted = adapter.mount(implementation)
    app.get('/outside', () => 'outside')

    expect(mounted).toBe(app)
    expectTypeOf(mounted).toEqualTypeOf<typeof app>()
    const result = await app.handle(
      new Request('http://localhost/api/items/item%201?tag=first&tag=second', {
        method: 'POST',
        headers: {
          'content-type': 'application/json',
          'x-actor': 'Ada',
          'x-request-id': 'request-1',
        },
        body: JSON.stringify({ name: 'Elysia' }),
      })
    )

    expect(result.status).toBe(201)
    await expect(result.json()).resolves.toEqual({
      actor: 'Ada',
      id: 'item 1',
      name: 'Elysia:Elysia',
      requestId: 'request-1',
      tags: ['first', 'second'],
    })
    expect(nativeInput?.elysiaContext.params['id']).toBe('item 1')
    expect(nativeInput?.route).toEqual({ key: ['create'], method: 'POST', path: '/api/items/:id' })
    expect(() => inProcessTransport(implementation as never)).toThrow(
      'Server requires the elysia adapter, but was mounted with in-process'
    )

    const outside = await app.handle(new Request('http://localhost/outside'))
    expect(outside.status).toBe(200)
    await expect(outside.text()).resolves.toBe('outside')
  })

  test('reuses a request body parsed by earlier Elysia lifecycle hooks', async () => {
    let lifecycleBody: unknown
    const app = new Elysia().onBeforeHandle(({ body }) => {
      lifecycleBody = body
    })
    elysiaAdapter(app).mount(
      defineServer(itemContract).implement({
        create: ({ body, headers, params, query }) => ({
          status: 201,
          body: {
            actor: 'none',
            id: params.id,
            name: body.name,
            requestId: headers['x-request-id'],
            tags: typeof query.tag === 'string' ? [query.tag] : [...query.tag],
          },
        }),
      })
    )

    const result = await app.handle(
      new Request('http://localhost/api/items/1?tag=one', {
        method: 'POST',
        headers: { 'content-type': 'application/json', 'x-request-id': 'request-2' },
        body: JSON.stringify({ name: 'cached' }),
      })
    )

    expect(result.status).toBe(201)
    expect(lifecycleBody).toEqual({ name: 'cached' })
    await expect(result.json()).resolves.toMatchObject({ name: 'cached' })
  })

  test('forwards Elysia context to adapter defaults and mount error hooks', async () => {
    const errorContract = defineContract({
      routes: {
        fail: route.get('/fail', { responses: { 200: response.text() } }),
        mountFail: route.get('/mount-fail', { responses: { 200: response.text() } }),
      },
    })
    const app = new Elysia().decorate('actor', 'Grace')
    type App = typeof app
    const defaultHook = vi.fn<(input: ElysiaServerErrorInput<App>) => Response>()
    const mountHook = vi.fn<(input: ElysiaServerErrorInput<App>) => Response>()
    const defaults: ElysiaServerOptions<App> = {
      onError: (input) => {
        expectTypeOf(input).toEqualTypeOf<ElysiaServerErrorInput<App>>()
        defaultHook(input)
        return new Response(`${input.elysiaContext.actor}:default`, {
          status: input.defaultResponse.status,
        })
      },
    }
    const adapter = elysiaAdapter(app, defaults)
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
        return new Response('mount', { status: input.defaultResponse.status })
      },
    })

    const defaultResult = await app.handle(new Request('http://localhost/fail'))
    const mountResult = await app.handle(new Request('http://localhost/mount-fail'))

    expect(defaultResult.status).toBe(500)
    await expect(defaultResult.text()).resolves.toBe('Grace:default')
    expect(mountResult.status).toBe(500)
    await expect(mountResult.text()).resolves.toBe('mount')
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

  test('supports QUERY routes and an Elysia prefix', async () => {
    const queryContract = defineContract({
      routes: { search: route.query('/search', { responses: { 200: response.text() } }) },
    })
    const implementation = defineServer(queryContract).implement({
      search: () => ({ status: 200, body: 'result' }),
    })
    const app = new Elysia()
    elysiaAdapter(app).mount(implementation)
    const prefixedApp = new Elysia({ prefix: '/v1' })
    expect(elysiaAdapter(prefixedApp).mount(implementation)).toBe(prefixedApp)

    const result = await app.handle(new Request('http://localhost/search', { method: 'QUERY' }))
    const prefixedResult = await prefixedApp.handle(new Request('http://localhost/v1/search', { method: 'QUERY' }))

    expect(result.status).toBe(200)
    await expect(result.text()).resolves.toBe('result')
    expect(prefixedResult.status).toBe(200)
    await expect(prefixedResult.text()).resolves.toBe('result')
  })
})
