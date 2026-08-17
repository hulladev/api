import { describe, expect, expectTypeOf, test, vi } from 'vitest'
import { z } from 'zod'
import { defineContract, request, response, route, router } from '../src'
import { defineClient, type ClientResponseResult, type ClientRouteInput } from '../src/client'
import { ndjson } from '../src/stream'
import { zodCodecFixture } from './zod-fixture'

const dateTime = zodCodecFixture(
  z.codec(z.iso.datetime(), z.date(), {
    decode: (value) => new Date(value),
    encode: (value) => value.toISOString(),
  })
)

const user = zodCodecFixture(
  z.object({
    id: z.string(),
    organizationId: z.string(),
    createdAt: dateTime,
  })
)

const apiError = response.json(z.object({ code: z.literal('UNAUTHORIZED') }))

const contract = defineContract({
  basePath: '/api',
  errors: { 401: apiError },
  routes: {
    health: route.get('/health', {
      responses: { 200: response.text(z.literal('ok')) },
    }),
    organizations: router('/organizations/:organizationId', {
      params: z.object({ organizationId: z.string() }),
      routes: {
        listUsers: route.get('/users', {
          query: request.query(
            zodCodecFixture(
              z.object({
                limit: z.codec(z.string(), z.number().int(), { decode: Number, encode: String }),
                tags: z.array(z.string()).optional(),
              })
            ),
            { repeated: ['tags'] }
          ),
          responses: { 200: response.json(zodCodecFixture(z.array(user))) },
        }),
        createUser: route.post('/users/:userId', {
          params: z.object({ userId: z.string() }),
          query: request.query(
            zodCodecFixture(
              z.object({
                notify: z.codec(z.enum(['true', 'false']), z.boolean(), {
                  decode: (value) => value === 'true',
                  encode: (value) => (value ? 'true' : 'false'),
                }),
              })
            ),
            { repeated: [] }
          ),
          headers: z.object({ 'x-actor-id': z.string() }),
          body: zodCodecFixture(z.object({ createdAt: dateTime })),
          responses: {
            201: response.json(user, { headers: z.object({ etag: z.string() }) }),
            409: response.json(z.object({ code: z.literal('CONFLICT') })),
          },
        }),
      },
    }),
  },
})

function jsonResponse(value: unknown, init: ResponseInit): Response {
  const headers = new Headers(init.headers)
  headers.set('content-type', 'application/json')
  return new Response(JSON.stringify(value), { ...init, headers })
}

describe('defineClient', () => {
  test('creates a contract-shaped tree with route-specific call types', () => {
    const definition = defineClient(contract, { fetch: vi.fn<typeof fetch>() })
    const client = definition.build()

    expect(definition.build()).toBe(client)

    expect(definition.contract).toBe(contract)
    expect(definition.context).toBeUndefined()
    expect(definition.middlewares).toEqual([])
    expect(Object.keys(client)).toEqual(['health', 'organizations'])
    expect(Object.keys(client.organizations)).toEqual(['listUsers', 'createUser'])

    expectTypeOf<Parameters<typeof client.health>>().toEqualTypeOf<
      [options?: { readonly headers?: HeadersInit; readonly signal?: AbortSignal }]
    >()
    expectTypeOf<Parameters<typeof client.organizations.createUser>[0]>().toExtend<{
      readonly params: { organizationId: string } & { userId: string }
      readonly query: { notify: boolean }
      readonly headers: { 'x-actor-id': string }
      readonly body: { createdAt: Date }
    }>()
    expectTypeOf<Awaited<ReturnType<typeof client.organizations.createUser>>['status']>().toEqualTypeOf<
      201 | 409 | 401
    >()

    type CreateInput = ClientRouteInput<(typeof contract.routes.organizations)['createUser']>
    type CreateResponses = ClientResponseResult<(typeof contract.routes.organizations)['createUser']['responses']>
    expectTypeOf<CreateInput>().toEqualTypeOf<Parameters<typeof client.organizations.createUser>[0]>()
    expectTypeOf<CreateResponses['status']>().toEqualTypeOf<201 | 409>()
  })

  test('creates per-request context and composes immutable middleware scopes', async () => {
    const calls: string[] = []
    const fetcher = vi.fn<typeof fetch>(async (request) => {
      calls.push('fetch')
      expect((request as Request).headers.get('authorization')).toBe('Bearer secret')
      return new Response('ok', { headers: { 'content-type': 'text/plain' } })
    })
    const base = defineClient(contract, {
      baseUrl: 'https://api.example.com',
      fetch: fetcher,
      context: ({ request, route: metadata }) => {
        calls.push('context')
        expectTypeOf(request).toEqualTypeOf<Request>()
        expectTypeOf(metadata.path).toEqualTypeOf<
          | '/api/health'
          | '/api/organizations/:organizationId/users'
          | '/api/organizations/:organizationId/users/:userId'
        >()
        return { token: 'secret', url: request.url }
      },
    })
    const authenticate = base.middleware(async (args, next) => {
      calls.push('authenticate')
      expectTypeOf(args.context.token).toEqualTypeOf<string>()
      expectTypeOf(args.request).toEqualTypeOf<Request>()
      expectTypeOf(args.route.key).toEqualTypeOf<
        readonly ['health'] | readonly ['organizations', 'listUsers'] | readonly ['organizations', 'createUser']
      >()
      expect(args.context.url).toBe(args.request.url)
      args.request.headers.set('authorization', `Bearer ${args.context.token}`)
      return next()
    })
    const observe = base.middleware(async (args, next) => {
      calls.push(`observe:${args.route.key.join('.')}`)
      return next()
    })
    const authenticated = base.use(authenticate, observe)

    await expect(authenticated.build().health()).resolves.toMatchObject({ status: 200, body: 'ok' })

    expect(base.middlewares).toEqual([])
    expect(authenticated.middlewares).toEqual([authenticate, observe])
    expect(authenticated.context).toBe(base.context)
    expect(calls).toEqual(['context', 'authenticate', 'observe:health', 'fetch'])
  })

  test('rejects invalid middleware at the JavaScript boundary', () => {
    const client = defineClient(contract)
    const middleware = client.middleware as unknown as (value: unknown) => unknown
    const use = client.use as unknown as (...values: readonly unknown[]) => unknown

    expect(() => middleware({})).toThrowError('Client middleware must be a function')
    expect(() => use(() => undefined, 'invalid')).toThrowError('Client middleware must be a function')
  })

  test('rejects middleware that calls next more than once', async () => {
    const fetcher = vi.fn(async () => new Response('ok', { headers: { 'content-type': 'text/plain' } }))
    const base = defineClient(contract, { baseUrl: 'https://api.example.com', fetch: fetcher })
    const duplicate = base.middleware(async (_input, next) => {
      await next()
      return next()
    })

    await expect(base.use(duplicate).build().health()).rejects.toThrowError(
      'Client middleware called next() more than once'
    )
    expect(fetcher).toHaveBeenCalledOnce()
  })

  test('rejects invalid context factory results at the JavaScript boundary', async () => {
    const client = defineClient(contract, {
      baseUrl: 'https://api.example.com',
      fetch: async () => new Response('ok', { headers: { 'content-type': 'text/plain' } }),
      context: (() => null) as never,
    }).build()

    await expect(client.health()).rejects.toThrowError('Client context factory must return an object')
  })

  test('performs a plain Fetch call for routes without declared input', async () => {
    const signal = new AbortController().signal
    const fetcher = vi.fn<typeof fetch>(async () => new Response('ok', { headers: { 'content-type': 'text/plain' } }))
    const client = defineClient(contract, {
      baseUrl: 'https://api.example.com/',
      fetch: fetcher,
      headers: { authorization: 'Bearer token' },
    }).build()

    const result = await client.health({ signal, headers: { 'x-request-id': 'request-1' } })

    expect(result).toEqual({
      status: 200,
      headers: expect.any(Headers),
      body: 'ok',
    })
    expect(fetcher).toHaveBeenCalledOnce()
    const [request] = fetcher.mock.calls[0]!
    expect(request).toBeInstanceOf(Request)
    expect((request as Request).url).toBe('https://api.example.com/api/health')
    expect((request as Request).method).toBe('GET')
    expect((request as Request).signal.aborted).toBe(false)
    expect((request as Request).headers).toEqual(
      new Headers({ authorization: 'Bearer token', 'x-request-id': 'request-1' })
    )
    expect((request as Request).body).toBeNull()
  })

  test('encodes nested params, repeated query, headers, and JSON bodies exactly once', async () => {
    const createdAt = new Date('2026-08-10T12:34:56.000Z')
    const fetcher = vi.fn<typeof fetch>(async () =>
      jsonResponse(
        {
          id: 'user/1',
          organizationId: 'hulla dev',
          createdAt: createdAt.toISOString(),
        },
        { status: 201, headers: { etag: 'user-1' } }
      )
    )
    const client = defineClient(contract, { baseUrl: 'https://api.example.com', fetch: fetcher }).build()

    const result = await client.organizations.createUser({
      params: { organizationId: 'hulla dev', userId: 'user/1' },
      query: { notify: true },
      headers: { 'x-actor-id': 'actor-1' },
      body: { createdAt },
    })

    expect(result).toEqual({
      status: 201,
      headers: { etag: 'user-1' },
      body: {
        id: 'user/1',
        organizationId: 'hulla dev',
        createdAt,
      },
    })
    if (result.status === 201) {
      expectTypeOf(result.body.createdAt).toEqualTypeOf<Date>()
      expectTypeOf(result.headers.etag).toEqualTypeOf<string>()
    }

    const [request] = fetcher.mock.calls[0]!
    expect((request as Request).url).toBe(
      'https://api.example.com/api/organizations/hulla%20dev/users/user%2F1?notify=true'
    )
    expect((request as Request).method).toBe('POST')
    expect((request as Request).headers).toEqual(
      new Headers({ 'content-type': 'application/json', 'x-actor-id': 'actor-1' })
    )
    expect(await (request as Request).text()).toBe(JSON.stringify({ createdAt: createdAt.toISOString() }))
  })

  test('serializes repeated query values through the compiled query transport', async () => {
    const fetcher = vi.fn<typeof fetch>(async () => jsonResponse([], { status: 200 }))
    const client = defineClient(contract, { baseUrl: 'https://api.example.com', fetch: fetcher }).build()

    await client.organizations.listUsers({
      params: { organizationId: 'organization-1' },
      query: { limit: 25, tags: ['admin', 'author'] },
    })

    expect((fetcher.mock.calls[0]![0] as Request).url).toBe(
      'https://api.example.com/api/organizations/organization-1/users?limit=25&tags=admin&tags=author'
    )
  })

  test('returns declared contract errors as values and rejects undeclared statuses', async () => {
    const unauthorized = defineClient(contract, {
      baseUrl: 'https://api.example.com',
      fetch: async () => jsonResponse({ code: 'UNAUTHORIZED' }, { status: 401 }),
    }).build()
    const missing = defineClient(contract, {
      baseUrl: 'https://api.example.com',
      fetch: async () => new Response('missing', { status: 404, headers: { 'content-type': 'text/plain' } }),
    }).build()

    await expect(unauthorized.health()).resolves.toEqual({
      status: 401,
      headers: expect.any(Headers),
      body: { code: 'UNAUTHORIZED' },
    })
    await expect(missing.health()).rejects.toMatchObject({
      code: 'unexpected-status',
      response: expect.any(Response),
    })
  })

  test('rejects responses whose representation does not match the declaration', async () => {
    const client = defineClient(contract, {
      baseUrl: 'https://api.example.com',
      fetch: async () => new Response('ok', { headers: { 'content-type': 'application/json' } }),
    }).build()

    await expect(client.health()).rejects.toMatchObject({
      code: 'content-type-mismatch',
      issues: [{ code: 'content-type-mismatch', location: 'response' }],
    })
  })

  test('locates response schema failures without replacing validator issue codes', async () => {
    const client = defineClient(contract, {
      baseUrl: 'https://api.example.com',
      fetch: async () => new Response('unhealthy', { headers: { 'content-type': 'text/plain' } }),
    }).build()

    await expect(client.health()).rejects.toMatchObject({
      code: 'schema-validation',
      location: 'response',
      issues: [{ code: 'invalid_value', location: 'response' }],
    })
  })

  test('supports explicit request representations and lazy response streams', async () => {
    const uploadContract = defineContract({
      routes: {
        upload: route.post('/upload', {
          body: request.bytes(),
          responses: { 204: response.empty() },
        }),
        events: route.get('/events', {
          responses: { 200: response.stream(ndjson(zodCodecFixture(z.object({ at: dateTime })))) },
        }),
      },
    })
    const createdAt = new Date('2026-08-10T14:00:00.000Z')
    const fetcher = vi.fn<typeof fetch>(async (input) =>
      (input as Request).url.endsWith('/events')
        ? new Response(`${JSON.stringify({ at: createdAt.toISOString() })}\n`, {
            headers: { 'content-type': 'application/x-ndjson' },
          })
        : new Response(null, { status: 204 })
    )
    const client = defineClient(uploadContract, { baseUrl: 'https://api.example.com', fetch: fetcher }).build()

    await expect(client.upload({ body: new Uint8Array([1, 2, 3]) })).resolves.toEqual({
      status: 204,
      headers: expect.any(Headers),
    })
    const events = await client.events()
    if (events.status === 200) {
      const values = []
      for await (const event of events.body) values.push(event)
      expect(values).toEqual([{ at: createdAt }])
      expectTypeOf(events.body).toEqualTypeOf<AsyncIterable<{ at: Date }>>()
    }

    const uploadRequest = fetcher.mock.calls[0]?.[0] as Request
    expect(new Uint8Array(await uploadRequest.arrayBuffer())).toEqual(new Uint8Array([1, 2, 3]))
    expect(uploadRequest.headers.get('content-type')).toBe('application/octet-stream')
  })

  test('rejects base URLs with search or hash components', () => {
    expect(() => defineClient(contract, { baseUrl: 'https://api.example.com?tenant=one' })).toThrowError(
      'cannot contain a query string'
    )
    expect(() => defineClient(contract, { baseUrl: new URL('https://api.example.com/#docs') })).toThrowError(
      'cannot contain a hash fragment'
    )
  })

  test('preserves prototype-like route keys safely', async () => {
    const keyedContract = defineContract({
      routes: {
        ['__proto__']: route.get('/safe', { responses: { 200: response.text(z.literal('ok')) } }),
      },
    })
    const client = defineClient(keyedContract, {
      baseUrl: 'https://api.example.com',
      fetch: async () => new Response('ok', { headers: { 'content-type': 'text/plain' } }),
    }).build()

    expect(Object.keys(client)).toEqual(['__proto__'])
    expect(Object.getPrototypeOf(client)).toBe(Object.prototype)
    await expect(client['__proto__']()).resolves.toMatchObject({ status: 200, body: 'ok' })
  })
})
