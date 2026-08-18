import { describe, expect, expectTypeOf, test } from 'vitest'
import { z } from 'zod'
import { codec, defineContract, request, response, route, router } from '../src'
import { defineClient } from '../src/client'
import { defineServer, ServerRuntimeError } from '../src/server'
import { createFetchHandler, type FetchHandler } from '../src/server'
import { ndjson } from '../src/stream'

const dateTime = z.codec(z.iso.datetime(), z.date(), {
  decode: (value) => new Date(value),
  encode: (value) => value.toISOString(),
})

const user = z.object({
  id: z.string(),
  organizationId: z.string(),
  createdAt: dateTime,
})

const directionalBodySchema = codec(z.object({ createdAt: z.iso.datetime() }), z.object({ createdAt: z.date() }), {
  decode: ({ createdAt }) => ({ createdAt: new Date(createdAt) }),
  encode: ({ createdAt }) => ({ createdAt: createdAt.toISOString() }),
})

const contract = defineContract({
  basePath: '/api',
  errors: {
    401: response.json(z.object({ code: z.literal('UNAUTHORIZED') })),
  },
  routes: {
    health: route.get('/health', {
      responses: { 200: response.text(z.literal('ok')) },
    }),
    organizations: router('/organizations/:organizationId', {
      params: z.object({ organizationId: z.string().min(1) }),
      routes: {
        createUser: route.post('/users/:userId', {
          params: z.object({ userId: z.string().min(1) }),
          query: z.object({
            notify: z.codec(z.enum(['true', 'false']), z.boolean(), {
              decode: (value) => value === 'true',
              encode: (value) => (value ? 'true' : 'false'),
            }),
          }),
          headers: z.object({ 'x-actor-id': z.string().min(1) }),
          body: z.object({ createdAt: dateTime }),
          responses: {
            201: response.json(user, { headers: z.object({ etag: z.string() }) }),
          },
        }),
      },
    }),
    events: route.get('/events', {
      responses: {
        200: response.stream(ndjson(z.object({ sequence: z.number() }))),
      },
    }),
  },
})

function buildServer(options: { readonly authorized?: boolean } = {}) {
  const calls: string[] = []
  const base = defineServer(contract, {
    context: ({ request, route: metadata }) => ({
      requestId: request.headers.get('x-request-id') ?? metadata.key.join('.'),
    }),
  })
  const authorize = base.middleware(async ({ context, next, response }) => {
    calls.push(`middleware:${context.requestId}`)
    return options.authorized === false ? response(401, { code: 'UNAUTHORIZED' }) : next()
  })
  const protectedServer = base.use(authorize)

  return {
    calls,
    implementation: protectedServer.build({
      health: () => ({ status: 200, body: 'ok' }),
      organizations: {
        createUser: (input) => {
          calls.push('handler:createUser')
          return {
            status: 201,
            headers: { etag: input.params.userId },
            body: {
              id: input.params.userId,
              organizationId: input.params.organizationId,
              createdAt: input.body.createdAt.toISOString(),
            },
          }
        },
      },
      events: () => ({
        status: 200,
        body: (async function* () {
          yield { sequence: 1 }
          yield { sequence: 2 }
        })(),
      }),
    }),
  }
}

describe('createFetchHandler', () => {
  test('round trips one application value through a core codec at both Fetch boundaries', async () => {
    const schema = directionalBodySchema
    const bodyContract = defineContract({
      routes: {
        echo: route.post('/echo', {
          body: schema,
          responses: { 200: response.json(schema) },
        }),
      },
    })
    const implementation = defineServer(bodyContract).build({
      echo: ({ body }) => ({ status: 200, body }),
    })
    const handler = createFetchHandler(implementation)
    let encodedRequestBody: unknown
    const client = defineClient(bodyContract, {
      baseUrl: 'https://api.example.com',
      fetch: async (requestValue) => {
        encodedRequestBody = await requestValue.clone().json()
        return handler(requestValue)
      },
    }).build()
    const createdAt = new Date('2026-08-06T10:00:00.000Z')

    const result = await client.echo({ body: { createdAt } })

    expect(encodedRequestBody).toEqual({ createdAt: createdAt.toISOString() })
    expect(result).toMatchObject({ status: 200, body: { createdAt } })
  })

  test('keeps vendor codecs directional unless a core codec is explicitly passed', async () => {
    let nativeDecodeCalls = 0
    let nativeEncodeCalls = 0
    const nativeCodec = z.codec(z.iso.datetime(), z.date(), {
      decode: (value) => {
        nativeDecodeCalls += 1
        return new Date(value)
      },
      encode: (value) => {
        nativeEncodeCalls += 1
        return value.toISOString()
      },
    })

    let explicitDecodeCalls = 0
    let explicitEncodeCalls = 0
    const explicitCodec = codec(z.iso.datetime(), z.date(), {
      decode: (value) => {
        explicitDecodeCalls += 1
        return new Date(value)
      },
      encode: (value) => {
        explicitEncodeCalls += 1
        return value.toISOString()
      },
    })

    const codecContract = defineContract({
      routes: {
        directional: route.post('/directional', {
          body: nativeCodec,
          responses: { 200: response.json(nativeCodec) },
        }),
        bidirectional: route.post('/bidirectional', {
          body: explicitCodec,
          responses: { 200: response.json(explicitCodec) },
        }),
      },
    })
    const handler = createFetchHandler(
      defineServer(codecContract).build({
        directional: ({ body }) => {
          expectTypeOf(body).toEqualTypeOf<Date>()
          return { status: 200, body: body.toISOString() }
        },
        bidirectional: ({ body }) => {
          expectTypeOf(body).toEqualTypeOf<Date>()
          return { status: 200, body }
        },
      })
    )
    const wireBodies: unknown[] = []
    const client = defineClient(codecContract, {
      baseUrl: 'https://api.example.com',
      fetch: async (request) => {
        wireBodies.push(await request.clone().json())
        return handler(request)
      },
    }).build()
    const isoDate = '2026-08-17T18:00:00.000Z'
    const date = new Date(isoDate)

    expectTypeOf<Parameters<typeof client.directional>[0]['body']>().toEqualTypeOf<string>()
    expectTypeOf<Parameters<typeof client.bidirectional>[0]['body']>().toEqualTypeOf<Date>()

    const directional = await client.directional({ body: isoDate })
    const bidirectional = await client.bidirectional({ body: date })

    expect(directional).toMatchObject({ status: 200, body: date })
    expect(bidirectional).toMatchObject({ status: 200, body: date })
    expect(wireBodies).toEqual([isoDate, isoDate])
    expect(nativeDecodeCalls).toBeGreaterThan(0)
    expect(nativeEncodeCalls).toBe(0)
    expect(explicitDecodeCalls).toBe(2)
    expect(explicitEncodeCalls).toBe(2)
  })

  test('encodes codec application values before path, query, and header transport', async () => {
    const params = codec(z.object({ id: z.string() }), z.object({ id: z.int() }), {
      decode: ({ id }) => ({ id: Number(id) }),
      encode: ({ id }) => ({ id: String(id) }),
    })
    const query = codec(z.object({ page: z.string() }), z.object({ page: z.int() }), {
      decode: ({ page }) => ({ page: Number(page) }),
      encode: ({ page }) => ({ page: String(page) }),
    })
    const headers = codec(
      z.object({ 'x-enabled': z.enum(['true', 'false']) }),
      z.object({ 'x-enabled': z.boolean() }),
      {
        decode: (value) => ({ 'x-enabled': value['x-enabled'] === 'true' }),
        encode: (value) => ({ 'x-enabled': value['x-enabled'] ? ('true' as const) : ('false' as const) }),
      }
    )
    const codecContract = defineContract({
      routes: {
        inspect: route.get('/users/:id', {
          params,
          query,
          headers,
          responses: { 200: response.json(directionalBodySchema, { headers }) },
        }),
      },
    })
    const createdAt = new Date('2026-08-17T18:00:00.000Z')
    const handler = createFetchHandler(
      defineServer(codecContract).build({
        inspect: (input) => {
          expectTypeOf(input.params.id).toEqualTypeOf<number>()
          expectTypeOf(input.query.page).toEqualTypeOf<number>()
          expectTypeOf(input.headers['x-enabled']).toEqualTypeOf<boolean>()
          expect(input).toMatchObject({
            params: { id: 2 },
            query: { page: 3 },
            headers: { 'x-enabled': true },
          })
          return { status: 200, headers: { 'x-enabled': true }, body: { createdAt } }
        },
      })
    )
    let requestValue: Request | undefined
    const client = defineClient(codecContract, {
      baseUrl: 'https://api.example.com',
      fetch: (request) => {
        requestValue = request as Request
        return handler(request)
      },
    }).build()

    const result = await client.inspect({
      params: { id: 2 },
      query: { page: 3 },
      headers: { 'x-enabled': true },
    })

    expect(requestValue?.url).toBe('https://api.example.com/users/2?page=3')
    expect(requestValue?.headers.get('x-enabled')).toBe('true')
    expect(result).toMatchObject({ status: 200, headers: { 'x-enabled': true }, body: { createdAt } })
  })

  test('runs a typed client round trip through the shared Fetch transport', async () => {
    const createdAt = new Date('2026-08-14T12:34:56.000Z')
    const server = buildServer()
    const handler = createFetchHandler(server.implementation)
    const client = defineClient(contract, { baseUrl: 'https://api.example.com', fetch: handler }).build()

    expectTypeOf(handler).toEqualTypeOf<FetchHandler>()
    await expect(client.health({ headers: { 'x-request-id': 'health-1' } })).resolves.toMatchObject({
      status: 200,
      body: 'ok',
    })
    await expect(
      client.organizations.createUser({
        params: { organizationId: 'hulla dev', userId: 'user/1' },
        query: { notify: 'true' },
        headers: { 'x-actor-id': 'actor-1' },
        body: { createdAt: createdAt.toISOString() },
      })
    ).resolves.toEqual({
      status: 201,
      headers: { etag: 'user/1' },
      body: { id: 'user/1', organizationId: 'hulla dev', createdAt },
    })
    expect(server.calls).toEqual(['middleware:health-1', 'middleware:organizations.createUser', 'handler:createUser'])
  })

  test('preserves the selected global error response through middleware', async () => {
    const handler = createFetchHandler(buildServer({ authorized: false }).implementation)
    const client = defineClient(contract, { baseUrl: 'https://api.example.com', fetch: handler }).build()

    await expect(client.health()).resolves.toEqual({
      status: 401,
      headers: expect.any(Headers),
      body: { code: 'UNAUTHORIZED' },
    })
  })

  test('returns protocol problems for routing, method, and incoming contract failures', async () => {
    const handler = createFetchHandler(buildServer().implementation)

    const missing = await handler(new Request('https://api.example.com/api/missing'))
    expect(missing.status).toBe(404)
    await expect(missing.json()).resolves.toMatchObject({ code: 'route-not-found', status: 404 })

    const wrongMethod = await handler(new Request('https://api.example.com/api/health', { method: 'POST' }))
    expect(wrongMethod.status).toBe(405)
    expect(wrongMethod.headers.get('allow')).toBe('GET')

    const wrongContentType = await handler(
      new Request('https://api.example.com/api/organizations/acme/users/user-1?notify=true', {
        method: 'POST',
        headers: { 'content-type': 'text/plain', 'x-actor-id': 'actor-1' },
        body: '{}',
      })
    )
    expect(wrongContentType.status).toBe(415)
    await expect(wrongContentType.json()).resolves.toMatchObject({
      code: 'unsupported-media-type',
      issues: [{ location: 'body' }],
    })

    const invalidQuery = await handler(
      new Request('https://api.example.com/api/organizations/acme/users/user-1?notify=not-a-boolean', {
        method: 'POST',
        headers: { 'content-type': 'application/json', 'x-actor-id': 'actor-1' },
        body: JSON.stringify({ createdAt: '2026-08-14T12:34:56.000Z' }),
      })
    )
    expect(invalidQuery.status).toBe(400)
    await expect(invalidQuery.json()).resolves.toMatchObject({
      code: 'schema-validation',
      issues: [{ location: 'query' }],
    })
  })

  test('reports internal failures to an optional hook without leaking them by default', async () => {
    const failures: unknown[] = []
    const base = defineServer(contract)
    const implementation = base.build({
      health: (() => 'invalid response') as never,
      organizations: {
        createUser: (input) => ({
          status: 201,
          headers: { etag: input.params.userId },
          body: {
            id: input.params.userId,
            organizationId: input.params.organizationId,
            createdAt: input.body.createdAt.toISOString(),
          },
        }),
      },
      events: () => ({ status: 200, body: [] }),
    })
    const handler = createFetchHandler(implementation, {
      onError: ({ error, phase, defaultResponse }) => {
        failures.push({ error, phase, status: defaultResponse.status })
      },
    })

    const responseValue = await handler(new Request('https://api.example.com/api/health'))
    expect(responseValue.status).toBe(500)
    await expect(responseValue.json()).resolves.toEqual({
      type: 'about:blank',
      title: 'Internal server error',
      status: 500,
      code: 'internal-server-error',
    })
    expect(failures).toEqual([
      {
        error: expect.objectContaining<Partial<ServerRuntimeError>>({ code: 'invalid-server-response' }),
        phase: 'response',
        status: 500,
      },
    ])
  })

  test('serializes formatted streams for incremental client decoding', async () => {
    const handler = createFetchHandler(buildServer().implementation)
    const client = defineClient(contract, { baseUrl: 'https://api.example.com', fetch: handler }).build()
    const result = await client.events()
    if (result.status !== 200) throw new Error('Expected event stream')

    const values = []
    for await (const value of result.body) values.push(value)
    expect(values).toEqual([{ sequence: 1 }, { sequence: 2 }])
  })

  test('supports binary request and response bodies through Web Fetch primitives', async () => {
    const bodyContract = defineContract({
      routes: {
        bytes: route.post('/bytes', {
          body: request.bytes(),
          responses: { 200: response.bytes() },
        }),
      },
    })
    const server = defineServer(bodyContract)
    const implementation = server.build({ bytes: (input) => ({ status: 200, body: input.body }) })
    const handler = createFetchHandler(implementation)
    const payload = new Uint8Array([1, 2, 3])
    const responseValue = await handler(
      new Request('https://api.example.com/bytes', {
        method: 'POST',
        headers: { 'content-type': 'application/octet-stream' },
        body: payload,
      })
    )

    expect(responseValue.status).toBe(200)
    expect(new Uint8Array(await responseValue.arrayBuffer())).toEqual(payload)
  })

  test('decodes the request body before context can consume the original request', async () => {
    const bodyContract = defineContract({
      routes: {
        echo: route.post('/echo', {
          body: request.text(),
          responses: { 200: response.text() },
        }),
      },
    })
    const server = defineServer(bodyContract, {
      context: async ({ request: contextRequest }) => ({ observed: await contextRequest.text() }),
    })
    const implementation = server.build({
      echo: (input) => ({ status: 200, body: `${input.context.observed}:${input.body}` }),
    })

    const result = await createFetchHandler(implementation)(
      new Request('https://api.example.com/echo', {
        method: 'POST',
        headers: { 'content-type': 'text/plain' },
        body: 'hello',
      })
    )

    expect(result.status).toBe(200)
    expect(await result.text()).toBe('hello:hello')
  })

  test('prefers a static route over a parameter route compiled earlier', async () => {
    const precedenceContract = defineContract({
      routes: {
        dynamic: route.get('/users/:id', {
          params: z.object({ id: z.string() }),
          responses: { 200: response.text() },
        }),
        current: route.get('/users/me', { responses: { 200: response.text() } }),
      },
    })
    const server = defineServer(precedenceContract)
    const implementation = server.build({
      dynamic: (input) => ({ status: 200, body: input.params.id }),
      current: () => ({ status: 200, body: 'current' }),
    })

    const result = await createFetchHandler(implementation)(new Request('https://api.example.com/users/me'))
    expect(await result.text()).toBe('current')
  })

  test('prefers the earliest static segment when overlapping parameter routes are equally specific', async () => {
    const precedenceContract = defineContract({
      routes: {
        collectionAction: route.get('/:collection/new', {
          params: z.object({ collection: z.string() }),
          responses: { 200: response.text() },
        }),
        user: route.get('/users/:id', {
          params: z.object({ id: z.string() }),
          responses: { 200: response.text() },
        }),
      },
    })
    const server = defineServer(precedenceContract)
    const implementation = server.build({
      collectionAction: () => ({ status: 200, body: 'collection' }),
      user: () => ({ status: 200, body: 'user' }),
    })

    const result = await createFetchHandler(implementation)(new Request('https://api.example.com/users/new'))
    expect(await result.text()).toBe('user')
  })

  test('rejects server middleware that calls next more than once', async () => {
    let handlerCalls = 0
    const base = defineServer(contract)
    const duplicate = base.middleware(async ({ next }) => {
      await next()
      return next()
    })
    const server = base.use(duplicate)
    const implementation = server.build({
      health: () => {
        handlerCalls += 1
        return { status: 200, body: 'ok' }
      },
      organizations: {
        createUser: (input) => ({
          status: 201,
          headers: { etag: input.params.userId },
          body: {
            id: input.params.userId,
            organizationId: input.params.organizationId,
            createdAt: input.body.createdAt.toISOString(),
          },
        }),
      },
      events: () => ({ status: 200, body: [] }),
    })

    const result = await createFetchHandler(implementation)(new Request('https://api.example.com/api/health'))
    expect(result.status).toBe(500)
    expect(handlerCalls).toBe(1)
  })

  test('serializes empty, form-data, and raw response escape hatches', async () => {
    const representationContract = defineContract({
      routes: {
        empty: route.get('/empty', { responses: { 204: response.empty() } }),
        form: route.get('/form', { responses: { 200: response.formData() } }),
        raw: route.get('/raw', { responses: { 202: response.raw() } }),
      },
    })
    const server = defineServer(representationContract)
    const implementation = server.build({
      empty: () => ({ status: 204 }),
      form: () => {
        const body = new FormData()
        body.set('name', 'Hulla')
        return { status: 200, body }
      },
      raw: () => ({ status: 202, body: new Response('raw', { status: 202 }) }),
    })
    const handler = createFetchHandler(implementation)

    const empty = await handler(new Request('https://api.example.com/empty'))
    expect(empty.status).toBe(204)
    expect(await empty.text()).toBe('')

    const form = await handler(new Request('https://api.example.com/form'))
    expect(form.headers.get('content-type')).toMatch(/^multipart\/form-data; boundary=/)
    expect((await form.formData()).get('name')).toBe('Hulla')

    const raw = await handler(new Request('https://api.example.com/raw'))
    expect(raw.status).toBe(202)
    expect(await raw.text()).toBe('raw')
  })

  test('parses FormData requests with the Fetch body reader', async () => {
    const formContract = defineContract({
      routes: {
        submit: route.post('/submit', {
          body: request.formData(),
          responses: { 200: response.text() },
        }),
      },
    })
    const server = defineServer(formContract)
    const implementation = server.build({
      submit: (input) => ({ status: 200, body: String(input.body.get('name')) }),
    })
    const body = new FormData()
    body.set('name', 'Ada')

    const result = await createFetchHandler(implementation)(
      new Request('https://api.example.com/submit', { method: 'POST', body })
    )

    expect(result.status).toBe(200)
    expect(await result.text()).toBe('Ada')
  })

  test('lets the Fetch error hook replace the protocol-safe response', async () => {
    const base = defineServer(contract)
    const implementation = base.build({
      health: (() => 'invalid response') as never,
      organizations: {
        createUser: (input) => ({
          status: 201,
          headers: { etag: input.params.userId },
          body: {
            id: input.params.userId,
            organizationId: input.params.organizationId,
            createdAt: input.body.createdAt.toISOString(),
          },
        }),
      },
      events: () => ({ status: 200, body: [] }),
    })
    const handler = createFetchHandler(implementation, {
      onError: ({ defaultResponse, phase, request: failedRequest }) => {
        expect(defaultResponse.status).toBe(500)
        expect(phase).toBe('response')
        expect(failedRequest).toBeInstanceOf(Request)
        return new Response('custom failure', { status: 418 })
      },
    })

    const result = await handler(new Request('https://api.example.com/api/health'))
    expect(result.status).toBe(418)
    expect(await result.text()).toBe('custom failure')
  })

  test('rejects non-Request inputs and raw responses with mismatched statuses', async () => {
    const handler = createFetchHandler(buildServer().implementation)
    await expect((handler as unknown as (value: unknown) => Promise<Response>)({})).rejects.toThrowError(
      'Fetch handler input must be a Request'
    )

    const rawContract = defineContract({
      routes: { raw: route.get('/raw', { responses: { 202: response.raw() } }) },
    })
    const server = defineServer(rawContract)
    const mismatched = server.build({
      raw: () => ({ status: 202, body: new Response('wrong', { status: 200 }) }),
    })

    await expect(createFetchHandler(mismatched)(new Request('https://api.example.com/raw'))).rejects.toThrowError(
      'Raw Fetch response status must match its declared contract status'
    )
  })
})
