import { describe, expect, expectTypeOf, test } from 'vitest'
import { z } from 'zod'
import { httpWire } from '../src'
import { createApi } from '../src/api'
import {
  clientProcedure,
  createHttpTransport,
  HullaAPIError,
  isHullaAPIError,
  type ClientRequestOptions,
} from '../src/client'
import { createApiHandler as createRawApiHandler, type ApiHandler, type ApiRouter } from '../src/server'
import type {
  HTTPContract,
  HTTPInputContract,
  HTTPSerialized,
  HTTPWireInput,
  HTTPWireOutput,
  ProcedureExecutionContext,
  Schema,
} from '../src/types.public'
import { schemaHTTPWire } from '../src/wire'
import { decodeHTTPBodyValue, encodeHTTPBodyValue } from '../src/wire-codec'
import { zodWireSchemaConverter } from '../src/zod'

describe('HTTP route transport', () => {
  test('dispatches explicit routes through a configurable base path', async () => {
    let requestUrl: string | undefined
    let requestId: string | null | undefined
    const api = createApi({
      middleware: {
        request: (context: ProcedureExecutionContext) => {
          requestUrl = context.request?.url
          return true
        },
      },
    })
    const routes = api
      .use('request')
      .router('values')
      .define(({ route, procedure }) => ({
        echo: route('POST', '/echo')
          .input(z.string())
          .output(z.string())
          .handler(({ input }) => input),
        internal: procedure.handler(() => 'secret'),
      }))
    const handler = createApiHandler({ routers: { values: routes }, basePath: '/http' })
    const client = createHttpTransport({
      baseUrl: 'https://example.com/http/values',
      fetch: async (request, init) => {
        const response = await handler.fetch(new Request(request, init))
        requestId = response.headers.get('x-hulla-request-id')
        return response
      },
    })

    await expect(client.call({ method: 'POST', path: '/echo' }, 'hello')).resolves.toBe('hello')
    expect(requestUrl).toBe('https://example.com/http/values/echo')
    expect(requestId).toMatch(/^[0-9a-f-]+$/)
    await expect(handler.fetch(new Request('https://example.com/http/values/internal'))).resolves.toMatchObject({
      status: 404,
    })
  })

  test('uses standard JSON for successful responses', async () => {
    expectTypeOf<HTTPSerialized<{ date: Date; count: bigint; bytes: Uint8Array }>>().toEqualTypeOf<{
      date: string
      count: string
      bytes: string
    }>()
    expectTypeOf<
      HTTPWireInput<{
        kind: 'tuple'
        items: [
          { kind: 'date'; encoding: 'iso' },
          { kind: 'bigint'; encoding: 'decimal' },
          { kind: 'bytes'; encoding: 'base64' },
        ]
      }>
    >().toEqualTypeOf<[Date, bigint, Uint8Array]>()
    expectTypeOf<
      HTTPWireOutput<{
        kind: 'tuple'
        items: [
          { kind: 'date'; encoding: 'iso' },
          { kind: 'bigint'; encoding: 'decimal' },
          { kind: 'bytes'; encoding: 'base64' },
        ]
      }>
    >().toEqualTypeOf<[string, string, string]>()
    const api = createApi()
    const routes = api.router('values').define(({ route }) => ({
      json: route('GET', '/json').handler(() => ({
        date: new Date('2026-07-10T12:00:00.000Z'),
        nested: { enabled: true },
        missing: undefined,
      })),
    }))
    const handler = createApiHandler({ routers: [routes] })
    const client = createHttpTransport({
      fetch: (request, init) => handler.fetch(new Request(new URL(String(request), 'https://example.com'), init)),
    })
    const result = (await client.call({ method: 'GET', path: '/values/json' })) as Record<string, unknown>

    expect(result).toEqual({ date: '2026-07-10T12:00:00.000Z', nested: { enabled: true } })
  })

  test('rejects unknown fields for exact HTTP object contracts', () => {
    const wire = {
      kind: 'object',
      properties: { id: { kind: 'number' } },
      additionalProperties: false,
    } as const

    expect(() => encodeHTTPBodyValue(wire, { id: 1, extra: true })).toThrow('Unexpected object property "extra"')
    expect(() => decodeHTTPBodyValue(wire, { id: 1, extra: true })).toThrow('Unexpected object property "extra"')
  })

  test('returns stable transport errors', async () => {
    const api = createApi()
    const routes = api.router('values').define(({ route }) => ({
      number: route('POST', '/number')
        .input(z.number())
        .handler(({ input }) => input),
    }))
    const handler = createApiHandler({ routers: [routes] })
    const client = createHttpTransport({
      fetch: (request, init) => handler.fetch(new Request(new URL(String(request), 'https://example.com'), init)),
    })

    const error = await client
      .call({ method: 'POST', path: '/values/number' }, 'wrong')
      .catch((reason: unknown) => reason)
    expect(error).toBeInstanceOf(HullaAPIError)
    expect(error).toMatchObject({ code: 'INVALID_INPUT', status: 400 })
    expect(isHullaAPIError(error, 'INVALID_INPUT')).toBe(true)
    if (isHullaAPIError(error, 'INVALID_INPUT')) {
      expectTypeOf(error.code).toEqualTypeOf<'INVALID_INPUT'>()
      expect(error.requestId).toMatch(/^[0-9a-f-]+$/)
      expect(error.body).toMatchObject({ code: 'INVALID_INPUT' })
    }
  })

  test('supports dynamic and request-scoped headers with cancellation', async () => {
    const controller = new AbortController()
    let headerReads = 0
    let captured: Request | undefined
    const client = createHttpTransport({
      baseUrl: 'https://example.com/api',
      headers: () => {
        headerReads += 1
        return { authorization: `Bearer token-${headerReads}`, 'x-priority': 'configured' }
      },
      fetch: async (input, init) => {
        captured = new Request(input, init)
        return Response.json({ ok: true })
      },
    })

    await expect(
      client.request<{ ok: boolean }>(
        { method: 'GET', path: '/health' },
        { signal: controller.signal, headers: { 'x-priority': 'request' } }
      )
    ).resolves.toEqual({ ok: true })

    expect(headerReads).toBe(1)
    expect(captured?.headers.get('authorization')).toBe('Bearer token-1')
    expect(captured?.headers.get('x-priority')).toBe('request')
    expect(captured?.signal.aborted).toBe(false)
    controller.abort()
    expect(captured?.signal.aborted).toBe(true)
  })

  test('adds request-scoped execution to generated client procedures', async () => {
    const api = createApi()
    const base = api.procedure.input(z.string()).handler(({ input }) => Promise.resolve(input.length))
    let options: ClientRequestOptions | undefined
    const procedure = clientProcedure(base, (nextOptions, input) => {
      options = nextOptions
      return Promise.resolve(input.length)
    })
    const controller = new AbortController()

    expectTypeOf(procedure.request).parameters.toEqualTypeOf<[ClientRequestOptions, string]>()
    expectTypeOf(procedure.request).returns.toEqualTypeOf<Promise<number>>()
    await expect(procedure.request({ signal: controller.signal }, 'hello')).resolves.toBe(5)
    expect(options?.signal).toBe(controller.signal)
  })

  test('maps flat object input across path, query, and body', async () => {
    const api = createApi()
    const routes = api.router('todos').define(({ route }) => ({
      get: route('GET', '/:id')
        .input(z.object({ id: z.number(), include: z.boolean() }))
        .handler(({ input }) => input),
      update: route('PATCH', '/:id')
        .input(z.object({ id: z.number(), title: z.string() }))
        .handler(({ input }) => input),
    }))
    const handler = createApiHandler({ routers: [routes] })
    const captured: Request[] = []
    const client = createHttpTransport({
      fetch: (request, init) => {
        const value = new Request(new URL(String(request), 'https://example.com'), init)
        captured.push(value)
        return handler.fetch(value.clone())
      },
    })

    await expect(client.call({ method: 'GET', path: '/todos/:id' }, { id: 1, include: true })).resolves.toEqual({
      id: 1,
      include: true,
    })
    await expect(client.call({ method: 'PATCH', path: '/todos/:id' }, { id: 2, title: 'done' })).resolves.toEqual({
      id: 2,
      title: 'done',
    })
    expect(captured[0]?.url).toBe('https://example.com/api/todos/1?include=true')
    expect(captured[0]?.headers.get('content-type')).toBeNull()
    expect(captured[1]?.url).toBe('https://example.com/api/todos/2')
    expect(await captured[1]?.json()).toEqual({ title: 'done' })

    const unknown = await handler.fetch(new Request('https://example.com/api/todos/1?include=true&extra=value'))
    expect(unknown.status).toBe(400)
    expect(await unknown.json()).toMatchObject({ code: 'INVALID_INPUT' })
  })

  test('maps positional input across path and body', async () => {
    const api = createApi()
    const routes = api.router('todos').define(({ route }) => ({
      update: route('PATCH', '/:id')
        .input(z.number(), z.object({ title: z.string() }))
        .handler(({ input }) => input),
    }))
    const handler = createApiHandler({ routers: [routes] })
    let captured: Request | undefined
    const client = createHttpTransport({
      fetch: (request, init) => {
        captured = new Request(new URL(String(request), 'https://example.com'), init)
        return handler.fetch(captured.clone())
      },
    })

    await expect(client.call({ method: 'PATCH', path: '/todos/:id' }, 2, { title: 'done' })).resolves.toEqual([
      2,
      { title: 'done' },
    ])
    expect(captured?.url).toBe('https://example.com/api/todos/2')
    expect(captured?.headers.get('content-type')).toBe('application/json')
    expect(await captured?.json()).toEqual({ title: 'done' })
  })

  test('keeps string path parameters readable', async () => {
    const api = createApi()
    const routes = api.router('workouts').define(({ route }) => ({
      update: route('PATCH', '/:id')
        .input(z.string().uuid(), z.object({ completed: z.boolean() }))
        .handler(({ input }) => input),
    }))
    const handler = createApiHandler({ routers: [routes] })
    const id = '767a5cff-8db8-4df0-861f-33d8c2d266b4'
    let captured: Request | undefined
    const client = createHttpTransport({
      fetch: (request, init) => {
        captured = new Request(new URL(String(request), 'https://example.com'), init)
        return handler.fetch(captured.clone())
      },
    })

    await expect(client.call({ method: 'PATCH', path: '/workouts/:id' }, id, { completed: true })).resolves.toEqual([
      id,
      { completed: true },
    ])
    expect(captured?.url).toBe(`https://example.com/api/workouts/${id}`)

    const direct = await handler.fetch(
      new Request(`https://example.com/api/workouts/${id}`, {
        method: 'PATCH',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ completed: false }),
      })
    )
    expect(direct.status).toBe(200)
    expect(await direct.json()).toEqual([id, { completed: false }])
  })

  test('uses repeated standard query parameters and schema-directed scalar parsing', async () => {
    const api = createApi()
    const routes = api.router('workouts').define(({ route }) => ({
      search: route('GET', '/search')
        .input(z.object({ tags: z.array(z.string()), limit: z.number(), active: z.boolean() }))
        .handler(({ input }) => input),
    }))
    const handler = createApiHandler({ routers: [routes] })
    let captured: Request | undefined
    const client = createHttpTransport({
      fetch: (request, init) => {
        captured = new Request(new URL(String(request), 'https://example.com'), init)
        return handler.fetch(captured.clone())
      },
    })

    await expect(
      client.call(
        { method: 'GET', path: '/workouts/search' },
        { tags: ['strength', 'mobility'], limit: 10, active: true }
      )
    ).resolves.toEqual({ tags: ['strength', 'mobility'], limit: 10, active: true })
    expect(captured?.url).toBe(
      'https://example.com/api/workouts/search?tags=strength&tags=mobility&limit=10&active=true'
    )
  })

  test('accepts equivalent duplicate fields and rejects conflicting HTTP locations', async () => {
    const api = createApi()
    const routes = api.router('todos').define(({ route }) => ({
      update: route('PATCH', '/:id')
        .input(z.object({ id: z.number(), title: z.string() }))
        .handler(({ input }) => input),
      merge: route('PATCH', '/merge')
        .input(
          z.object({
            active: z.boolean(),
            tags: z.array(z.string()),
            filter: z.object({ archived: z.boolean() }),
            at: z.date(),
          })
        )
        .handler(({ input }) => ({ ...input, at: input.at.toISOString() })),
    }))
    const handler = createApiHandler({ routers: [routes] })

    const equivalent = await handler.fetch(
      new Request('https://example.com/api/todos/1?id=1', {
        method: 'PATCH',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ id: 1, title: 'updated' }),
      })
    )
    expect(equivalent.status).toBe(200)
    expect(await equivalent.json()).toEqual({ id: 1, title: 'updated' })

    const structured = await handler.fetch(
      new Request(
        'https://example.com/api/todos/merge?active=true&tags=a&tags=b&filter=%7B%22archived%22%3Afalse%7D&at=2026-01-01T00%3A00%3A00.000Z',
        {
          method: 'PATCH',
          headers: { 'content-type': 'application/json' },
          body: JSON.stringify({
            active: true,
            tags: ['a', 'b'],
            filter: { archived: false },
            at: '2026-01-01T00:00:00.000Z',
          }),
        }
      )
    )
    expect(structured.status).toBe(200)
    expect(await structured.json()).toEqual({
      active: true,
      tags: ['a', 'b'],
      filter: { archived: false },
      at: '2026-01-01T00:00:00.000Z',
    })

    for (const request of [
      new Request('https://example.com/api/todos/1?id=2', {
        method: 'PATCH',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ id: 1, title: 'updated' }),
      }),
      new Request('https://example.com/api/todos/1?id=1&title=query', {
        method: 'PATCH',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ id: 1, title: 'body' }),
      }),
    ]) {
      const response = await handler.fetch(request)
      expect(response.status).toBe(409)
      expect(await response.json()).toMatchObject({ code: 'INPUT_CONFLICT' })
    }
  })

  test('lets optional and defaulted schemas handle absent HTTP input', async () => {
    const api = createApi()
    const routes = api.router('values').define(({ route }) => ({
      optional: route('POST', '/optional')
        .input(z.string().optional())
        .handler(({ input }) => input ?? 'optional'),
      defaulted: route('GET', '/defaulted')
        .input(z.number().default(5))
        .handler(({ input }) => input),
    }))
    const handler = createApiHandler({ routers: [routes] })
    const client = createHttpTransport({
      fetch: (request, init) => handler.fetch(new Request(new URL(String(request), 'https://example.com'), init)),
    })

    await expect(client.call({ method: 'POST', path: '/values/optional' }, undefined)).resolves.toBe('optional')
    await expect(client.call({ method: 'GET', path: '/values/defaulted' }, undefined)).resolves.toBe(5)
  })

  test('decodes mixed special values independently within one JSON input', async () => {
    const api = createApi()
    const routes = api.router('values').define(({ route }) => ({
      mixed: route('POST', '/mixed')
        .input(
          z.object({
            id: z.string(),
            at: z.date(),
            count: z.bigint(),
            bytes: httpWire(z.instanceof(Uint8Array), { kind: 'bytes', encoding: 'base64' }),
          })
        )
        .handler(({ input }) => ({
          id: input.id,
          at: input.at.toISOString(),
          count: input.count.toString(),
          bytes: [...input.bytes],
        })),
    }))
    const handler = createApiHandler({ routers: [routes] })
    const client = createHttpTransport({
      fetch: (request, init) => handler.fetch(new Request(new URL(String(request), 'https://example.com'), init)),
    })

    await expect(
      client.call(
        { method: 'POST', path: '/values/mixed' },
        { id: '123', at: new Date('2026-01-01T00:00:00.000Z'), count: 2n, bytes: new Uint8Array([1, 2]) }
      )
    ).resolves.toEqual({ id: '123', at: '2026-01-01T00:00:00.000Z', count: '2', bytes: [1, 2] })
  })

  test('preserves complex positional GET inputs and optional positional holes', async () => {
    const api = createApi()
    const routes = api.router('values').define(({ route }) => ({
      arrays: route('GET', '/arrays')
        .input(z.array(z.string()), z.number())
        .handler(({ input }) => input),
      hole: route('GET', '/hole')
        .input(z.string().optional(), z.number())
        .handler(({ input }) => ({ missing: input[0] === undefined, value: input[1] })),
    }))
    const handler = createApiHandler({ routers: [routes] })
    const client = createHttpTransport({
      fetch: (request, init) => handler.fetch(new Request(new URL(String(request), 'https://example.com'), init)),
    })

    await expect(client.call({ method: 'GET', path: '/values/arrays' }, ['a', 'b'], 2)).resolves.toEqual([
      ['a', 'b'],
      2,
    ])
    await expect(client.call({ method: 'GET', path: '/values/hole' }, undefined, 2)).resolves.toEqual({
      missing: true,
      value: 2,
    })
  })

  test('reports malformed JSON and excessive input ambiguity as invalid input', async () => {
    const api = createApi()
    const routes = api.router('values').define(({ route }) => ({
      body: route('POST', '/body')
        .input(z.string())
        .handler(({ input }) => input),
      ambiguous: route('GET', '/ambiguous')
        .input(httpWire(z.never(), { kind: 'json' }))
        .handler(() => undefined),
    }))
    const handler = createApiHandler({ routers: [routes] })

    const malformed = await handler.fetch(
      new Request('https://example.com/api/values/body', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: '{',
      })
    )
    expect(malformed.status).toBe(400)
    expect(await malformed.json()).toMatchObject({ code: 'INVALID_INPUT' })

    const ambiguous = await handler.fetch(new Request('https://example.com/api/values/ambiguous?a=1&b=2&c=3&d=4'))
    expect(ambiguous.status).toBe(400)
    expect(await ambiguous.json()).toMatchObject({ code: 'INVALID_INPUT' })
  })

  test('uses ordinary HTTP headers without a proprietary protocol marker', async () => {
    const api = createApi()
    const routes = api.router('health').define(({ route }) => ({
      read: route('GET', '/').handler(() => ({ ok: true })),
    }))
    const response = await createApiHandler({ routers: [routes] }).fetch(new Request('https://example.com/api/health'))

    expect(response.headers.get('x-hulla-protocol')).toBeNull()
    expect(response.headers.get('content-type')).toContain('application/json')
  })

  test('returns 204 for undefined and reports allowed methods', async () => {
    const api = createApi()
    const routes = api.router('health').define(({ route }) => ({
      read: route('GET', '/').handler(() => undefined),
      inspect: route('HEAD', '/details').handler(() => ({ ok: true })),
    }))
    const handler = createApiHandler({ routers: [routes] })

    const empty = await handler.fetch(new Request('https://example.com/api/health'))
    expect(empty.status).toBe(204)
    expect(await empty.text()).toBe('')

    const head = await handler.fetch(new Request('https://example.com/api/health/details', { method: 'HEAD' }))
    expect(head.status).toBe(200)
    expect(await head.text()).toBe('')

    const mismatch = await handler.fetch(new Request('https://example.com/api/health', { method: 'POST' }))
    expect(mismatch.status).toBe(405)
    expect(mismatch.headers.get('allow')).toBe('GET')
  })

  test('keeps contract-free URL input raw and parses its schema once', async () => {
    let parses = 0
    const rawStringSchema: Schema<string> = {
      parse(value) {
        parses++
        if (typeof value !== 'string') throw new Error('expected string')
        return value
      },
      _input: undefined as never,
      _output: undefined as never,
    }
    const api = createApi()
    const routes = api.router('values').define(({ route }) => ({
      get: route('GET', '/:id')
        .input(rawStringSchema)
        .handler(({ input }) => input),
    }))
    const handler = createRawApiHandler({ routers: [routes] })
    const response = await handler.fetch(new Request('https://example.com/api/values/00123'))

    expect(response.status).toBe(200)
    expect(await response.json()).toBe('00123')
    expect(parses).toBe(1)
  })

  test('orders strict static specializations and rejects crossed route overlaps', async () => {
    const api = createApi()
    const routes = api.router('items').define(({ route }) => ({
      generic: route('GET', '/:id')
        .input(z.string())
        .handler(({ input }) => ({ route: 'generic', input })),
      create: route('GET', '/new').handler(() => ({ route: 'create' })),
    }))
    const handler = createRawApiHandler({ routers: [routes] })

    const response = await handler.fetch(new Request('https://example.com/api/items/new'))
    expect(await response.json()).toEqual({ route: 'create' })

    const crossed = api.router('crossed').define(({ route }) => ({
      left: route('GET', '/:id/foo')
        .input(z.string())
        .handler(({ input }) => input),
      right: route('GET', '/bar/:slug')
        .input(z.string())
        .handler(({ input }) => input),
    }))
    expect(() => createRawApiHandler({ routers: [crossed] })).toThrow('overlap ambiguously')
  })

  test('enforces the JSON wire media type without imposing a body-size policy', async () => {
    const api = createApi()
    const routes = api.router('values').define(({ route }) => ({
      echo: route('POST', '/echo')
        .input(z.object({ value: z.string() }))
        .handler(({ input }) => input),
    }))
    const handler = createApiHandler({ routers: [routes] })

    const unsupported = await handler.fetch(
      new Request('https://example.com/api/values/echo', {
        method: 'POST',
        headers: { 'content-type': 'text/plain' },
        body: JSON.stringify({ value: 'wrong media' }),
      })
    )
    expect(unsupported.status).toBe(415)
    expect(await unsupported.json()).toMatchObject({ code: 'UNSUPPORTED_MEDIA_TYPE' })

    const suffixJSON = await handler.fetch(
      new Request('https://example.com/api/values/echo', {
        method: 'POST',
        headers: { 'content-type': 'application/problem+json; charset=utf-8' },
        body: JSON.stringify({ value: 'accepted' }),
      })
    )
    expect(suffixJSON.status).toBe(200)
    expect(await suffixJSON.json()).toEqual({ value: 'accepted' })
  })

  test('propagates application, output, encoding, and request-stream failures', async () => {
    const failure = new Error('handler failed')
    const api = createApi({
      middleware: {
        broken: () => {
          throw new Error('middleware failed')
        },
      },
    })
    const circular: Record<string, unknown> = {}
    circular['self'] = circular
    const routes = api.router('failures').define(({ route }) => ({
      handler: route('GET', '/handler').handler(() => {
        throw failure
      }),
      middleware: route('GET', '/middleware')
        .use('broken')
        .handler(() => 'unreachable'),
      output: route('GET', '/output')
        .output(z.string())
        .handler(() => 1 as never),
      encoding: route('GET', '/encoding').handler(() => circular),
      body: route('POST', '/body')
        .input(z.string())
        .handler(({ input }) => input),
    }))
    const handler = createRawApiHandler({ routers: [routes] })

    await expect(handler.fetch(new Request('https://example.com/api/failures/handler'))).rejects.toBe(failure)
    await expect(handler.fetch(new Request('https://example.com/api/failures/middleware'))).rejects.toThrow(
      'middleware failed'
    )
    await expect(handler.fetch(new Request('https://example.com/api/failures/output'))).rejects.toThrow()
    await expect(handler.fetch(new Request('https://example.com/api/failures/encoding'))).rejects.toThrow()

    const streamFailure = new Error('request stream failed')
    const stream = new ReadableStream<Uint8Array>({
      start(controller) {
        controller.error(streamFailure)
      },
    })
    const request = new Request('https://example.com/api/failures/body', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: stream,
      duplex: 'half',
    } as RequestInit & { duplex: 'half' })
    await expect(handler.fetch(request)).rejects.toBe(streamFailure)
  })

  test('rejects stale contracts when the handler is created', () => {
    const api = createApi()
    const routes = api.router('values').define(({ route }) => ({
      get: route('GET', '/:id')
        .input(z.number())
        .handler(({ input }) => input),
    }))
    const contract: HTTPContract = {
      version: 1,
      source: 'stale-test',
      basePath: '/api',
      routes: {
        values: {
          get: {
            router: 'values',
            procedure: 'get',
            method: 'POST',
            path: '/values/:id',
            input: { kind: 'value', wire: { kind: 'number' } },
          },
        },
      },
    }

    expect(() => createRawApiHandler({ routers: [routes], contract })).toThrow('method does not match')
    expect(() => createRawApiHandler({ routers: [routes], contract, basePath: '/api' })).toThrow(
      'cannot combine contract and basePath'
    )
  })
})

const zodConverter = zodWireSchemaConverter()

function createApiHandler(options: {
  routers: ApiRouter | readonly ApiRouter[] | Readonly<Record<string, ApiRouter>>
  basePath?: string
}): ApiHandler {
  const routers: readonly ApiRouter[] = Array.isArray(options.routers)
    ? (options.routers as readonly ApiRouter[])
    : Object.values(options.routers).every((value) => value && typeof value === 'object' && '$meta' in value)
      ? [options.routers as ApiRouter]
      : (Object.values(options.routers) as ApiRouter[])
  const contract: HTTPContract = {
    version: 1,
    source: 'http-test',
    basePath: options.basePath ?? '/api',
    routes: Object.fromEntries(
      routers.map((router) => {
        const entries = Object.entries(router).filter(([, procedure]) => procedure.$meta.route)
        const routerName = entries[0]?.[1].$meta.router
        if (!routerName) throw new Error('Expected a named router.')
        return [
          routerName,
          Object.fromEntries(
            entries.map(([name, procedure]) => {
              const route = procedure.$meta.route!
              const input = procedure.$meta.input ? inputContract(procedure.$meta.input) : undefined
              return [
                name,
                {
                  router: routerName,
                  procedure: name,
                  method: route.method,
                  path: `/${routerName}${route.path === '/' ? '' : route.path}`,
                  ...(input ? { input } : {}),
                },
              ]
            })
          ),
        ]
      })
    ),
  }
  return createRawApiHandler({ routers, contract })
}

function inputContract(schema: Schema): HTTPInputContract {
  const items = (schema as Schema & { 'hulla.api.inputSchemas'?: readonly Schema[] })['hulla.api.inputSchemas']
  return items
    ? { kind: 'tuple', items: items.map((item) => schemaHTTPWire(item, [zodConverter], 'input')) }
    : { kind: 'value', wire: schemaHTTPWire(schema, [zodConverter], 'input') }
}
