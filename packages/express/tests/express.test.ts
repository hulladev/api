import { EventEmitter } from 'node:events'
import { defineContract, response, route, type Contract } from '@hulla/api'
import { defineServer, type ServerExecutableFor } from '@hulla/api/server'
import express from 'express'
import { describe, expect, expectTypeOf, test } from 'vitest'
import { z } from 'zod'
import {
  expressAdapter,
  type ExpressHandler,
  type ExpressRequest,
  type ExpressResponse,
  type ExpressRouter,
  type ExpressServerOptions,
} from '../src'

type RegisteredEndpoint = {
  readonly handlers: readonly ExpressHandler[]
  readonly method: string
  readonly path: string
}

function captureEndpoints<
  const ContractType extends Contract,
  const Context extends object,
  Locals extends Record<string, unknown> = Record<string, unknown>,
>(
  implementation: ServerExecutableFor<
    ContractType,
    Context,
    'express',
    {
      readonly locals: Readonly<Locals>
      readonly request: ExpressRequest
      readonly response: ExpressResponse
    }
  >,
  options?: ExpressServerOptions<Locals>,
  defaults?: ExpressServerOptions<Locals>
): readonly RegisteredEndpoint[] {
  const endpoints: RegisteredEndpoint[] = []
  const registrar =
    (method: string) =>
    (path: string, ...handlers: ExpressHandler[]) => {
      endpoints.push({ handlers, method, path })
    }
  const router: ExpressRouter = {
    delete: registrar('DELETE'),
    get: registrar('GET'),
    patch: registrar('PATCH'),
    post: registrar('POST'),
    put: registrar('PUT'),
    query: registrar('QUERY'),
  }
  expressAdapter<Locals>(router, defaults).mount(implementation, options)
  return endpoints
}

function endpointHandler<
  const ContractType extends Contract,
  const Context extends object,
  Locals extends Record<string, unknown> = Record<string, unknown>,
>(
  implementation: ServerExecutableFor<
    ContractType,
    Context,
    'express',
    {
      readonly locals: Readonly<Locals>
      readonly request: ExpressRequest
      readonly response: ExpressResponse
    }
  >
): ExpressHandler {
  const handler = captureEndpoints(implementation)[0]?.handlers.at(-1)
  if (handler === undefined) throw new Error('Expected a registered Express handler')
  return handler
}

type RecordedResponse = {
  readonly body: () => Uint8Array
  readonly headers: Map<string, string | readonly string[]>
  readonly response: ExpressResponse
  readonly status: () => number
}

function recordedResponse(locals: Record<string, unknown> = {}): RecordedResponse {
  const events = new EventEmitter()
  const chunks: Uint8Array[] = []
  const headers = new Map<string, string | readonly string[]>()
  let status = 0
  let ended = false
  const response = {
    locals,
    get writableEnded() {
      return ended
    },
    get statusCode() {
      return status
    },
    set statusCode(value: number) {
      status = value
    },
    getHeaderNames() {
      return [...headers.keys()]
    },
    removeHeader(name: string) {
      headers.delete(name)
    },
    end(value?: string | Uint8Array) {
      if (value !== undefined) chunks.push(typeof value === 'string' ? new TextEncoder().encode(value) : value.slice())
      ended = true
      return response
    },
    json(value: unknown) {
      chunks.push(new TextEncoder().encode(JSON.stringify(value)))
      ended = true
      return response
    },
    off(event: string | symbol, listener: (...arguments_: unknown[]) => void) {
      events.off(event, listener)
      return response
    },
    on(event: string | symbol, listener: (...arguments_: unknown[]) => void) {
      events.on(event, listener)
      return response
    },
    once(event: string | symbol, listener: (...arguments_: unknown[]) => void) {
      events.once(event, listener)
      return response
    },
    setHeader(name: string, value: string | number | readonly string[]) {
      headers.set(name, typeof value === 'number' ? String(value) : value)
      return response
    },
    send(value: string | Uint8Array) {
      chunks.push(typeof value === 'string' ? new TextEncoder().encode(value) : value.slice())
      ended = true
      return response
    },
    status(code: number) {
      status = code
      return response
    },
    write(chunk: Uint8Array) {
      chunks.push(chunk.slice())
      return true
    },
  } as unknown as ExpressResponse

  return {
    body: () => {
      const length = chunks.reduce((total, chunk) => total + chunk.byteLength, 0)
      const body = new Uint8Array(length)
      let offset = 0
      for (const chunk of chunks) {
        body.set(chunk, offset)
        offset += chunk.byteLength
      }
      return body
    },
    headers,
    response,
    status: () => status,
  }
}

function baseRequest(overrides: Partial<ExpressRequest>): ExpressRequest {
  const events = new EventEmitter()
  const request = {
    headers: { host: 'api.example.com' },
    method: 'GET',
    url: '/',
    off(event: string | symbol, listener: (...arguments_: unknown[]) => void) {
      events.off(event, listener)
      return request
    },
    on(event: string | symbol, listener: (...arguments_: unknown[]) => void) {
      events.on(event, listener)
      return request
    },
    once(event: string | symbol, listener: (...arguments_: unknown[]) => void) {
      events.once(event, listener)
      return request
    },
    ...overrides,
  } as unknown as ExpressRequest
  return request
}

const itemContract = defineContract({
  basePath: '/api',
  routes: {
    create: route.post('/items/:id', {
      params: z.object({ id: z.string() }),
      query: z.object({ tag: z.union([z.string(), z.array(z.string())]) }),
      headers: z.object({ 'x-actor': z.string() }),
      body: z.object({ name: z.string() }),
      responses: {
        201: response.json(
          z.object({
            actor: z.string(),
            id: z.string(),
            name: z.string(),
            requestName: z.string(),
            tags: z.array(z.string()),
          })
        ),
      },
    }),
  },
})

function itemImplementation() {
  return defineServer(itemContract, { context: () => ({}) }).implement({
    create: async (input) => {
      return {
        status: 201,
        body: {
          actor: input.headers['x-actor'],
          id: input.params.id,
          name: input.body.name,
          requestName: input.body.name,
          tags: typeof input.query.tag === 'string' ? [input.query.tag] : [...input.query.tag],
        },
      }
    },
  })
}

describe('Express endpoints', () => {
  test('registers native routes on a caller-owned Express app', async () => {
    const app = express()
    const middlewareOrder: string[] = []
    app.use(express.json())
    app.use((_request, _response, next) => {
      middlewareOrder.push('before-endpoints')
      next()
    })
    expect(expressAdapter(app).mount(itemImplementation())).toBe(app)
    app.use((_request, _response, next) => {
      middlewareOrder.push('after-endpoints')
      next()
    })
    app.get('/outside', (_request, responseValue) => responseValue.status(200).send('outside'))
    const mountedContract = defineContract({
      routes: { inspect: route.get('/inspect', { responses: { 200: response.text() } }) },
    })
    const mountedRouter = express.Router()
    const mountedAdapter = expressAdapter(mountedRouter)
    const mountedImplementation = defineServer(mountedContract, {
      context: mountedAdapter.context(({ request }) => ({ url: request.originalUrl })),
    }).implement({
      inspect: ({ context }) => ({ status: 200, body: context.url }),
    })
    const mountedMiddlewareOrder: string[] = []
    mountedRouter.use((_request, _response, next) => {
      mountedMiddlewareOrder.push('router-middleware')
      next()
    })
    mountedAdapter.mount(mountedImplementation)
    app.use('/mounted', mountedRouter)
    const queryContract = defineContract({
      routes: { search: route.query('/search', { responses: { 200: response.text() } }) },
    })
    expressAdapter(app).mount(
      defineServer(queryContract).implement({
        search: () => ({ status: 200, body: 'query' }),
      })
    )
    const server = app.listen(0, '127.0.0.1')
    await new Promise<void>((resolve, reject) => {
      server.once('listening', resolve)
      server.once('error', reject)
    })

    try {
      const address = server.address()
      if (address === null || typeof address === 'string') throw new Error('Expected a TCP server address')
      const result = await fetch(`http://127.0.0.1:${address.port}/api/items/express?tag=real`, {
        method: 'POST',
        headers: { 'content-type': 'application/json', 'x-actor': 'actor-express' },
        body: JSON.stringify({ name: 'Express' }),
      })

      expect(result.status).toBe(201)
      expect(middlewareOrder).toEqual(['before-endpoints'])
      await expect(result.json()).resolves.toMatchObject({
        actor: 'actor-express',
        id: 'express',
        name: 'Express',
        requestName: 'Express',
        tags: ['real'],
      })

      const outside = await fetch(`http://127.0.0.1:${address.port}/outside`)
      expect(outside.status).toBe(200)
      await expect(outside.text()).resolves.toBe('outside')

      const mounted = await fetch(`http://127.0.0.1:${address.port}/mounted/inspect`)
      expect(mounted.status).toBe(200)
      await expect(mounted.text()).resolves.toBe('/mounted/inspect')
      expect(mountedMiddlewareOrder).toEqual(['router-middleware'])

      const queryResult = await fetch(`http://127.0.0.1:${address.port}/search`, { method: 'QUERY' })
      expect(queryResult.status).toBe(200)
      await expect(queryResult.text()).resolves.toBe('query')
    } finally {
      if (server.listening) {
        await new Promise<void>((resolve, reject) => {
          server.close((error) => (error === undefined ? resolve() : reject(error)))
        })
      }
    }
  })

  test('registers route handlers without creating an Express app', async () => {
    const endpoints = captureEndpoints(itemImplementation())
    expect(endpoints).toHaveLength(1)
    expect(endpoints[0]).toMatchObject({ method: 'POST', path: '/api/items/:id' })
    const handler = endpoints[0]!.handlers.at(-1)!
    const recorded = recordedResponse()
    let forwarded: unknown

    await handler(
      baseRequest({
        body: { name: 'Ada' },
        headers: {
          host: 'api.example.com',
          'content-type': 'application/json',
          'x-actor': 'actor-1',
        },
        method: 'POST',
        originalUrl: '/api/items/item%201?tag=first&tag=second',
        params: { id: 'item 1' },
        protocol: 'https',
        url: '/api/items/item%201?tag=first&tag=second',
      }),
      recorded.response,
      (error) => {
        forwarded = error
      }
    )

    expect(forwarded).toBeUndefined()
    expect(recorded.status()).toBe(201)
    expect(recorded.headers.get('content-type')).toBe('application/json')
    expect(JSON.parse(new TextDecoder().decode(recorded.body()))).toEqual({
      actor: 'actor-1',
      id: 'item 1',
      name: 'Ada',
      requestName: 'Ada',
      tags: ['first', 'second'],
    })
    expectTypeOf(handler).toEqualTypeOf<ExpressHandler>()
  })

  test('enriches context with the native Express request and locals', async () => {
    const bridgeContract = defineContract({
      routes: { inspect: route.get('/inspect', { responses: { 200: response.text() } }) },
    })
    let expressRequest: ExpressRequest | undefined
    const adapter = expressAdapter<{ readonly actor: string }>(express.Router())
    const implementation = defineServer(bridgeContract, {
      context: adapter.context(({ request, locals }) => {
        expressRequest = request
        expectTypeOf(locals.actor).toEqualTypeOf<string>()
        return { originalUrl: request.originalUrl, actor: locals.actor }
      }),
    }).implement({
      inspect: ({ context }) => ({ status: 200, body: `${context.actor}:${context.originalUrl}` }),
    })
    const nativeRequest = baseRequest({
      originalUrl: '/mounted/inspect',
      url: '/inspect',
    })
    const recorded = recordedResponse({ actor: 'Ada' })

    await endpointHandler(implementation)(nativeRequest, recorded.response, (error) => {
      if (error !== undefined) throw error
    })

    expect(new TextDecoder().decode(recorded.body())).toBe('Ada:/mounted/inspect')
    expect(expressRequest).toBe(nativeRequest)
  })

  test('requires native parser middleware for request bodies', async () => {
    let runtimeError: unknown
    let errorRequest: ExpressRequest | undefined
    let errorResponse: ExpressResponse | undefined
    let errorLocals: Readonly<Record<string, unknown>> | undefined
    const handler = captureEndpoints(itemImplementation(), undefined, {
      onError({ defaultResponse, error, locals, request, response }) {
        runtimeError = error
        errorRequest = request
        errorResponse = response
        errorLocals = locals
        return defaultResponse
      },
    })[0]!.handlers.at(-1)!
    const recorded = recordedResponse()
    const expressRequest = baseRequest({
      headers: {
        host: 'api.example.com',
        'content-type': 'application/json',
        'x-actor': 'actor-2',
      },
      method: 'POST',
      originalUrl: '/api/items/item-2?tag=compiler',
      params: { id: 'item-2' },
      protocol: 'https',
      url: '/api/items/item-2?tag=compiler',
    })

    await handler(expressRequest, recorded.response, (error) => {
      if (error !== undefined) throw error
    })

    expect(recorded.status()).toBe(400)
    expect(errorRequest).toBe(expressRequest)
    expect(errorResponse).toBe(recorded.response)
    expect(errorLocals).toBe(recorded.response.locals)
    expect(runtimeError).toMatchObject({
      code: 'invalid-request-body',
      cause: expect.objectContaining({
        message: expect.stringContaining('install matching Express parser middleware before mount()'),
      }),
    })
  })

  test('streams response bodies without collapsing chunks', async () => {
    const streamContract = defineContract({
      routes: {
        download: route.get('/download', {
          responses: { 200: response.stream({ contentType: 'application/octet-stream' }) },
        }),
      },
    })
    const implementation = defineServer(streamContract).implement({
      download: () => ({
        status: 200,
        body: (async function* () {
          yield new Uint8Array([1, 2])
          yield new Uint8Array([3, 4])
        })(),
      }),
    })
    const recorded = recordedResponse()

    await endpointHandler(implementation)(baseRequest({ url: '/download' }), recorded.response, (error) => {
      if (error !== undefined) throw error
    })

    expect(recorded.status()).toBe(200)
    expect(recorded.headers.get('content-type')).toBe('application/octet-stream')
    expect(recorded.body()).toEqual(new Uint8Array([1, 2, 3, 4]))
  })

  test('creates handlers only for routes selected by an implementation fragment', () => {
    const fragmentContract = defineContract({
      routes: {
        first: route.get('/first', { responses: { 200: response.text() } }),
        second: route.get('/second', { responses: { 200: response.text() } }),
      },
    })
    const server = defineServer(fragmentContract)
    const fragment = server.implement(fragmentContract.routes.second, () => ({ status: 200, body: 'second' }))

    expect(captureEndpoints(fragment).map(({ method, path }) => ({ method, path }))).toEqual([
      { method: 'GET', path: '/second' },
    ])
  })

  test('serializes form data and preserves raw Fetch responses', async () => {
    const representationContract = defineContract({
      routes: {
        form: route.get('/form', { responses: { 200: response.formData() } }),
        raw: route.get('/raw', { responses: { 202: response.raw() } }),
      },
    })
    const implementation = defineServer(representationContract).implement({
      form: () => {
        const body = new FormData()
        body.set('name', 'Hulla')
        return { status: 200, body }
      },
      raw: () => ({
        status: 202,
        body: new Response('accepted', {
          status: 202,
          headers: { 'x-raw': 'yes' },
        }),
      }),
    })
    const endpoints = captureEndpoints(implementation)
    const formHandler = endpoints.find((endpoint) => endpoint.path === '/form')!.handlers.at(-1)!
    const rawHandler = endpoints.find((endpoint) => endpoint.path === '/raw')!.handlers.at(-1)!

    const form = recordedResponse()
    await formHandler(baseRequest({ url: '/form' }), form.response, (error) => {
      if (error !== undefined) throw error
    })
    const formResponse = new Response(form.body() as BodyInit, {
      status: form.status(),
      headers: Object.fromEntries(form.headers) as unknown as HeadersInit,
    })
    expect((await formResponse.formData()).get('name')).toBe('Hulla')

    const raw = recordedResponse()
    await rawHandler(baseRequest({ url: '/raw' }), raw.response, (error) => {
      if (error !== undefined) throw error
    })
    expect(raw.status()).toBe(202)
    expect(raw.headers.get('x-raw')).toBe('yes')
    expect(new TextDecoder().decode(raw.body())).toBe('accepted')
  })

  test('returns a safe fallback for native serialization failures before headers', async () => {
    const rawContract = defineContract({
      routes: { raw: route.get('/raw', { responses: { 202: response.raw() } }) },
    })
    const implementation = defineServer(rawContract).implement({
      raw: () => ({ status: 202, body: new Response('wrong status') }),
    })
    const recorded = recordedResponse()
    let forwarded: unknown

    await endpointHandler(implementation)(baseRequest({ url: '/raw' }), recorded.response, (error) => {
      forwarded = error
    })

    expect(forwarded).toBeUndefined()
    expect(recorded.status()).toBe(500)
    expect(JSON.parse(new TextDecoder().decode(recorded.body()))).toMatchObject({ code: 'internal-server-error' })
  })
})
