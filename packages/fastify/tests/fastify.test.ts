import { defineContract, response, route } from '@hulla/api'
import { inProcessTransport } from '@hulla/api/in-process'
import { defineServer } from '@hulla/api/server'
import Fastify from 'fastify'
import { describe, expect, expectTypeOf, test, vi } from 'vitest'
import { z } from 'zod'
import {
  fastifyAdapter,
  type FastifyContextInput,
  type FastifyReply,
  type FastifyRequest,
  type FastifyServerErrorInput,
  type FastifyServerOptions,
} from '../src'

declare module 'fastify' {
  // oxlint-disable-next-line typescript/consistent-type-definitions -- Fastify decorations require declaration merging.
  interface FastifyRequest {
    actor: string
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
          })
        ),
      },
    }),
  },
})

function itemImplementation() {
  return defineServer(itemContract).implement({
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
}

describe('Fastify integration', () => {
  test('registers native routes on a caller-owned Fastify app', async () => {
    const app = Fastify()
    app.decorateRequest('actor', 'anonymous')
    app.addHook('preHandler', (request, _reply, done) => {
      request.actor = 'Ada'
      done()
    })
    app.addHook('onSend', (_request, reply, payload, done) => {
      reply.header('x-after', 'yes')
      done(null, payload)
    })

    let nativeInput: FastifyContextInput<typeof itemContract> | undefined
    const adapter = fastifyAdapter(app)
    const implementation = defineServer(itemContract, {
      context: adapter.context((input) => {
        expectTypeOf(input.request).toEqualTypeOf<FastifyRequest>()
        expectTypeOf(input.reply).toEqualTypeOf<FastifyReply>()
        nativeInput = input as FastifyContextInput<typeof itemContract>
        return {
          actor: input.request.actor,
          originalName: (input.request.body as { readonly name: string }).name,
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
    const result = await app.inject({
      method: 'POST',
      url: '/api/items/item%201?tag=first&tag=second',
      headers: { 'content-type': 'application/json', 'x-request-id': 'request-1' },
      payload: { name: 'Fastify' },
    })

    expect(result.statusCode).toBe(201)
    expect(result.headers['x-after']).toBe('yes')
    expect(result.json()).toEqual({
      actor: 'Ada',
      id: 'item 1',
      name: 'Fastify:Fastify',
      requestId: 'request-1',
      tags: ['first', 'second'],
    })
    expect(nativeInput?.request.params).toEqual({ id: 'item 1' })
    expect(nativeInput?.route).toEqual({ key: ['create'], method: 'POST', path: '/api/items/:id' })
    expect(() => inProcessTransport(implementation as never)).toThrow(
      'Server requires the fastify adapter, but was mounted with in-process'
    )

    const outside = await app.inject({ method: 'GET', url: '/outside' })
    expect(outside.statusCode).toBe(200)
    expect(outside.body).toBe('outside')
    await app.close()
  })

  test('uses Fastify parsed bodies and reports a missing parser result', async () => {
    const parsedApp = Fastify()
    fastifyAdapter(parsedApp).mount(itemImplementation())
    const parsed = await parsedApp.inject({
      method: 'POST',
      url: '/api/items/1?tag=one',
      headers: { 'content-type': 'application/json', 'x-request-id': 'request-2' },
      payload: { name: 'parsed' },
    })
    expect(parsed.statusCode).toBe(201)
    expect(parsed.json()).toMatchObject({ name: 'parsed' })
    await parsedApp.close()

    let runtimeError: unknown
    const missingApp = Fastify()
    missingApp.removeContentTypeParser('application/json')
    missingApp.addContentTypeParser('application/json', { parseAs: 'string' }, (_request, _body, done) => {
      done(null, undefined)
    })
    fastifyAdapter(missingApp, {
      onError(input) {
        runtimeError = input.error
        return input.defaultResponse
      },
    }).mount(itemImplementation())
    const missing = await missingApp.inject({
      method: 'POST',
      url: '/api/items/2?tag=two',
      headers: { 'content-type': 'application/json', 'x-request-id': 'request-3' },
      payload: JSON.stringify({ name: 'missing' }),
    })
    expect(missing.statusCode).toBe(400)
    expect(runtimeError).toMatchObject({
      code: 'invalid-request-body',
      cause: expect.objectContaining({ message: expect.stringContaining('matching content-type parser') }),
    })
    await missingApp.close()
  })

  test('forwards Fastify context to adapter defaults and mount error hooks', async () => {
    const errorContract = defineContract({
      routes: {
        fail: route.get('/fail', { responses: { 200: response.text() } }),
        mountFail: route.get('/mount-fail', { responses: { 200: response.text() } }),
      },
    })
    const app = Fastify()
    app.decorateRequest('actor', 'Grace')
    const defaultHook = vi.fn<(input: FastifyServerErrorInput) => void>()
    const mountHook = vi.fn<(input: FastifyServerErrorInput) => void>()
    const defaults: FastifyServerOptions = {
      onError: (input) => {
        expectTypeOf(input).toEqualTypeOf<FastifyServerErrorInput>()
        defaultHook(input)
        return {
          ...input.defaultResponse,
          headers: { 'content-type': 'text/plain' },
          body: { kind: 'text', value: `${input.request.actor}:default` },
        }
      },
    }
    const adapter = fastifyAdapter(app, defaults)
    const server = defineServer(errorContract)
    adapter.mount(
      server.implement(errorContract.routes.fail, (): { readonly body: string; readonly status: 200 } => {
        throw new Error('default failure')
      })
    )
    adapter.mount(
      server.implement(errorContract.routes.mountFail, (): { readonly body: string; readonly status: 200 } => {
        throw new Error('mount failure')
      }),
      {
        onError: (input) => {
          mountHook(input)
          return {
            ...input.defaultResponse,
            headers: { 'content-type': 'text/plain' },
            body: { kind: 'text', value: 'mount' },
          }
        },
      }
    )

    const defaultResult = await app.inject({ method: 'GET', url: '/fail' })
    const mountResult = await app.inject({ method: 'GET', url: '/mount-fail' })
    expect(defaultResult.statusCode).toBe(500)
    expect(defaultResult.body).toBe('Grace:default')
    expect(mountResult.statusCode).toBe(500)
    expect(mountResult.body).toBe('mount')
    expect(defaultHook).toHaveBeenCalledWith(
      expect.objectContaining({ phase: 'handler', route: { key: ['fail'], method: 'GET', path: '/fail' } })
    )
    expect(mountHook).toHaveBeenCalledWith(
      expect.objectContaining({
        phase: 'handler',
        route: { key: ['mountFail'], method: 'GET', path: '/mount-fail' },
      })
    )
    await app.close()
  })

  test('supports QUERY routes and Fastify plugin prefixes', async () => {
    const queryContract = defineContract({
      routes: { search: route.query('/search', { responses: { 200: response.text() } }) },
    })
    const implementation = defineServer(queryContract).implement({
      search: () => ({ status: 200, body: 'result' }),
    })
    const app = Fastify()
    fastifyAdapter(app).mount(implementation)
    await app.register(
      async (instance) => {
        expect(fastifyAdapter(instance).mount(implementation)).toBe(instance)
      },
      { prefix: '/v1' }
    )

    await app.ready()
    expect(app.hasRoute({ method: 'QUERY' as never, url: '/search' })).toBe(true)
    expect(app.hasRoute({ method: 'QUERY' as never, url: '/v1/search' })).toBe(true)
    await app.close()
  })

  test('streams, encodes form data, and preserves raw Fetch responses', async () => {
    const representationContract = defineContract({
      routes: {
        stream: route.get('/stream', {
          responses: { 200: response.stream({ contentType: 'application/octet-stream' }) },
        }),
        form: route.get('/form', { responses: { 200: response.formData() } }),
        raw: route.get('/raw', { responses: { 202: response.raw() } }),
      },
    })
    const app = Fastify()
    fastifyAdapter(app).mount(
      defineServer(representationContract).implement({
        stream: () => ({
          status: 200,
          body: (async function* () {
            yield new Uint8Array([1, 2])
            yield new Uint8Array([3, 4])
          })(),
        }),
        form: () => {
          const body = new FormData()
          body.set('name', 'Hulla')
          return { status: 200, body }
        },
        raw: () => ({
          status: 202,
          body: new Response('accepted', { status: 202, headers: { 'x-raw': 'yes' } }),
        }),
      })
    )

    const stream = await app.inject({ method: 'GET', url: '/stream' })
    expect(stream.statusCode).toBe(200)
    expect(stream.rawPayload).toEqual(Buffer.from([1, 2, 3, 4]))

    const form = await app.inject({ method: 'GET', url: '/form' })
    expect(form.statusCode).toBe(200)
    const formResponse = new Response(form.rawPayload as BodyInit, {
      status: form.statusCode,
      headers: form.headers as HeadersInit,
    })
    expect((await formResponse.formData()).get('name')).toBe('Hulla')

    const raw = await app.inject({ method: 'GET', url: '/raw' })
    expect(raw.statusCode).toBe(202)
    expect(raw.headers['x-raw']).toBe('yes')
    expect(raw.body).toBe('accepted')
    await app.close()
  })
})
