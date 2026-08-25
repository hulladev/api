import { describe, expect, expectTypeOf, test, vi } from 'vitest'
import { z } from 'zod'
import { createAdapterHandler, createAdapterRuntime, type AdapterHandler, type AdapterResponse } from '../src/adapters'
import { defineContract } from '../src/contract'
import { request } from '../src/contract/request'
import { response } from '../src/contract/response'
import { route } from '../src/contract/route'
import { defineServer } from '../src/server'
import { asyncSchema, type ObjectSchema } from '../src/validation'

function createAdapterTestRuntime() {
  const contract = defineContract({
    routes: {
      echo: route.post('/echo', {
        body: z.object({ message: z.string() }),
        responses: { 200: response.json(z.object({ message: z.string() })) },
      }),
      dynamic: route.get('/users/:id', {
        params: z.object({ id: z.string() }),
        responses: { 200: response.text() },
      }),
      current: route.get('/users/me', {
        responses: { 200: response.text() },
      }),
      bytes: route.post('/bytes', {
        body: request.bytes(),
        responses: { 200: response.bytes() },
      }),
    },
  })
  const server = defineServer(contract)
  return createAdapterHandler(
    server.implement({
      echo: (input) => ({ status: 200, body: input.body }),
      dynamic: (input) => ({ status: 200, body: input.params.id }),
      current: () => ({ status: 200, body: 'current' }),
      bytes: (input) => ({ status: 200, body: input.body }),
    })
  )
}

describe('adapter server runtime', () => {
  test('executes a route preselected by a native host router', async () => {
    const contract = defineContract({
      routes: {
        inspect: route.get('/items/:id', {
          params: z.object({ id: z.string() }),
          responses: { 200: response.text() },
        }),
      },
    })
    const runtime = createAdapterRuntime(
      defineServer(contract).implement({
        inspect: ({ params }) => ({ status: 200, body: params.id }),
      })
    )

    expect(runtime.routes.map(({ key, method, path }) => ({ key, method, path }))).toEqual([
      { key: ['inspect'], method: 'GET', path: '/items/:id' },
    ])
    expect(Object.isFrozen(runtime.routes)).toBe(true)
    expect(Object.isFrozen(runtime.routes[0])).toBe(true)
    await expect(
      runtime.routes[0]!.execute({
        request: new Request('https://adapter.test/unrelated'),
        params: { id: 'host-selected' },
      })
    ).resolves.toMatchObject({ status: 200, body: { kind: 'text', value: 'host-selected' } })
  })

  test('preserves prototype-named response headers', async () => {
    const headersSchema: ObjectSchema = {
      '~standard': {
        version: 1,
        vendor: 'test',
        validate: (value) =>
          typeof value === 'object' && value !== null && !Array.isArray(value)
            ? { value: value as Readonly<Record<string, unknown>> }
            : { issues: [{ message: 'Expected headers' }] },
      },
    }
    const headers: Record<string, unknown> = {}
    Object.defineProperty(headers, '__proto__', { enumerable: true, value: 'preserved' })
    const contract = defineContract({
      routes: {
        inspect: route.get('/inspect', {
          responses: { 200: response.text({ headers: headersSchema }) },
        }),
      },
    })
    const dispatch = createAdapterHandler(
      defineServer(contract).implement({
        inspect: () => ({ status: 200, headers, body: 'ok' }),
      })
    )

    const result = await dispatch({
      request: new Request('https://adapter.test/inspect'),
      method: 'GET',
      pathname: '/inspect',
    })

    expect(Object.hasOwn(result.headers, '__proto__')).toBe(true)
    expect(result.headers['__proto__']).toBe('preserved')
  })

  test('dispatches adapter-extracted values and returns a structured response', async () => {
    const dispatch = createAdapterTestRuntime()
    const original = new Request('https://adapter.test/echo', { method: 'POST' })

    expectTypeOf(dispatch).toEqualTypeOf<AdapterHandler>()
    const result = await dispatch({
      request: original,
      method: 'POST',
      pathname: '/echo',
      headers: { 'content-type': 'application/json' },
      body: { value: { message: 'already parsed' } },
    })

    expect(result).toEqual({
      status: 200,
      headers: { 'content-type': 'application/json' },
      body: { kind: 'json', value: { message: 'already parsed' } },
    })
    expectTypeOf(result).toEqualTypeOf<AdapterResponse>()
  })

  test('requests lazy body extraction with the declared representation', async () => {
    const dispatch = createAdapterTestRuntime()
    const readBody = vi.fn<() => Promise<Uint8Array>>(async () => new Uint8Array([1, 2, 3]))

    const result = await dispatch({
      request: new Request('https://adapter.test/bytes', { method: 'POST' }),
      method: 'POST',
      pathname: '/bytes',
      headers: { 'content-type': 'application/octet-stream' },
      readBody,
    })

    expect(readBody).toHaveBeenCalledWith('bytes', false)
    expect(result.body).toEqual({ kind: 'bytes', value: new Uint8Array([1, 2, 3]) })
  })

  test('preserves native request bodies only when server context is configured', async () => {
    const contract = defineContract({
      routes: { echo: route.post('/echo', { body: request.text(), responses: { 200: response.text() } }) },
    })
    const implementation = defineServer(contract, { context: () => ({ requestId: 'request-1' }) }).implement({
      echo: ({ body }) => ({ status: 200, body }),
    })
    const readBody = vi.fn<() => Promise<string>>(async () => 'hello')

    await createAdapterHandler(implementation)({
      request: {},
      method: 'POST',
      pathname: '/echo',
      headers: { 'content-type': 'text/plain' },
      readBody,
    })

    expect(readBody).toHaveBeenCalledWith('text', true)
  })

  test('handles route precedence and protocol failures', async () => {
    const dispatch = createAdapterTestRuntime()
    const request = new Request('https://adapter.test')

    await expect(dispatch({ request, method: 'GET', pathname: '/users/me' })).resolves.toMatchObject({
      status: 200,
      body: { kind: 'text', value: 'current' },
    })
    await expect(dispatch({ request, method: 'POST', pathname: '/users/me' })).resolves.toMatchObject({
      status: 405,
      headers: { allow: 'GET' },
      body: { kind: 'json', value: { code: 'method-not-allowed' } },
    })
    await expect(dispatch({ request, method: 'GET', pathname: '/missing' })).resolves.toMatchObject({
      status: 404,
      body: { kind: 'json', value: { code: 'route-not-found' } },
    })
    await expect(dispatch({ request, method: 'GET', pathname: '/users/%GG' })).resolves.toMatchObject({
      status: 400,
      body: { kind: 'json', value: { code: 'invalid-path-encoding' } },
    })
  })

  test('lazily compiles encoded-path routing for an otherwise static table', async () => {
    const contract = defineContract({
      routes: { health: route.get('/health', { responses: { 200: response.text() } }) },
    })
    const server = defineServer(contract)
    const dispatch = createAdapterHandler(server.implement({ health: () => ({ status: 200, body: 'ok' }) }))

    await expect(
      dispatch({ request: new Request('https://adapter.test/health'), method: 'GET', pathname: '/he%61lth' })
    ).resolves.toMatchObject({
      status: 200,
      body: { kind: 'text', value: 'ok' },
    })
  })

  test('preserves static path precedence for equivalent encoded paths', async () => {
    const contract = defineContract({
      routes: {
        fixed: route.get('/items/fixed', { responses: { 200: response.text() } }),
        dynamic: route.post('/items/:id', {
          params: z.object({ id: z.string() }),
          responses: { 200: response.text() },
        }),
      },
    })
    const dispatch = createAdapterHandler(
      defineServer(contract).implement({
        fixed: () => ({ status: 200, body: 'fixed' }),
        dynamic: ({ params }) => ({ status: 200, body: params.id }),
      })
    )

    for (const pathname of ['/items/fixed', '/items/%66ixed']) {
      await expect(
        dispatch({ request: new Request('https://adapter.test'), method: 'POST', pathname })
      ).resolves.toMatchObject({ status: 405, headers: { allow: 'GET' } })
    }
  })

  test('awaits asynchronous schemas and reports rejected response validation in the response phase', async () => {
    const inputSchema = asyncSchema(z.string())
    const outputSchema = asyncSchema(z.literal('ok'))
    const contract = defineContract({
      routes: {
        execute: route.post('/execute', {
          body: inputSchema,
          responses: { 200: response.json(outputSchema) },
        }),
      },
    })
    const server = defineServer(contract)
    const valid = createAdapterHandler(server.implement({ execute: () => ({ status: 200, body: 'ok' }) }))
    const input = {
      request: new Request('https://adapter.test/execute', { method: 'POST' }),
      method: 'POST',
      pathname: '/execute',
      headers: { 'content-type': 'application/json' },
      body: { value: 'input' },
    } as const

    await expect(valid(input)).resolves.toMatchObject({ status: 200, body: { kind: 'json', value: 'ok' } })

    const phases: string[] = []
    const invalid = createAdapterHandler(
      server.implement({ execute: (() => ({ status: 200, body: 'invalid' })) as never }),
      { onError: ({ phase }) => void phases.push(phase) }
    )
    await expect(invalid(input)).resolves.toMatchObject({
      status: 500,
      body: { kind: 'json', value: { code: 'internal-server-error' } },
    })
    expect(phases).toEqual(['response'])
  })

  test('reports non-iterable stream bodies inside the response error boundary', async () => {
    const contract = defineContract({
      routes: { events: route.get('/events', { responses: { 200: response.stream() } }) },
    })
    const phases: string[] = []
    const dispatch = createAdapterHandler(
      defineServer(contract).implement({
        events: (() => ({ status: 200, body: {} })) as never,
      }),
      { onError: ({ phase }) => void phases.push(phase) }
    )

    await expect(dispatch({ request: {}, method: 'GET', pathname: '/events' })).resolves.toMatchObject({
      status: 500,
      body: { kind: 'json', value: { code: 'internal-server-error' } },
    })
    expect(phases).toEqual(['response'])
  })
})
