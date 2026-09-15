import { codec, defineContract, defineErrors, response, route, router } from '@hulla/api'
import { ClientResponseError, createClient as createAPIClient, type ClientTransport } from '@hulla/api/client'
import { fetchTransport } from '@hulla/api/fetch'
import { fetchAdapter } from '@hulla/api/fetch'
import { defineServer } from '@hulla/api/server'
import { describe, expect, expectTypeOf, test, vi } from 'vitest'
import { z } from 'zod'
import { createClient, type ClientResult, type RequestFailure } from '../src'

const failures = defineErrors({
  NOT_FOUND: { data: z.object({ id: z.string() }) },
  DENIED: {},
})
const contract = defineContract({
  errors: { 403: failures.DENIED, 404: failures.NOT_FOUND },
  routes: {
    health: route.get('/health', { responses: { 200: response.text(), 204: response.empty() } }),
    users: router('/users', {
      routes: {
        get: route.get('/:id', {
          params: z.object({ id: z.string() }),
          responses: {
            200: response.json(z.object({ id: z.string() })),
            409: response.json(z.object({ retry: z.boolean() })),
          },
        }),
      },
    }),
  },
})

const transport =
  (status: number, body?: unknown): ClientTransport =>
  () => ({
    status,
    headers: { 'content-type': 'application/json', 'x-request-id': 'one' },
    readBody: () => body,
  })

function httpClient(status: number, body?: unknown) {
  return createClient(contract, { transport: transport(status, body) })
}

describe('result clients', () => {
  test('preserves successful response values, headers, and route arguments', async () => {
    const result = await httpClient(200, { id: 'one' }).users.get({ params: { id: 'one' } })
    expect(result.isOk()).toBe(true)
    if (!result.isOk()) throw new Error('Expected success')
    expectTypeOf(result.value.status).toEqualTypeOf<200>()
    expectTypeOf(result.value.body).toEqualTypeOf<{ id: string }>()
    expect(result.value).toEqual({
      status: 200,
      headers: { 'content-type': 'application/json', 'x-request-id': 'one' },
      body: { id: 'one' },
    })
    expect(result.match((value) => value.body.id)).toBe('one')
  })

  test('preserves empty successes and accepts options for no-input routes', async () => {
    const controller = new AbortController()
    const send = vi.fn<ClientTransport>(transport(204))
    const result = await createClient(contract, { transport: send }).health({ signal: controller.signal })
    expect(result.isOk()).toBe(true)
    if (!result.isOk()) throw new Error('Expected empty success')
    expectTypeOf(result.value.status).toEqualTypeOf<200 | 204>()
    expect(result.value).not.toHaveProperty('body')
    expect(send.mock.calls[0]?.[0].signal).toBe(controller.signal)
  })

  test.each([
    [403, { code: 'DENIED', message: 'Denied' }],
    [404, { code: 'NOT_FOUND', message: 'Missing', data: { id: 'one' } }],
    [409, { retry: true }],
  ])('returns declared HTTP failure %s with exact response types', async (status, body) => {
    const result = await httpClient(status, body).users.get({ params: { id: 'one' } })
    expect(result.isErr()).toBe(true)
    if (!result.isErr() || result.error.kind !== 'http') throw new Error('Expected HTTP failure')
    const failure = result.error.response
    expectTypeOf(failure.status).toEqualTypeOf<403 | 404 | 409>()
    if (failure.status === 404) {
      expectTypeOf(failure.body.code).toEqualTypeOf<'NOT_FOUND'>()
      expectTypeOf(failure.body.data).toEqualTypeOf<{ id: string }>()
    }
    if (failure.status === 409) expectTypeOf(failure.body).toEqualTypeOf<{ retry: boolean }>()
    expect(failure).toMatchObject({ status, body })
  })

  test.each([new Error('offline'), 'custom rejection', undefined])(
    'preserves arbitrary rejection causes',
    async (cause) => {
      const client = createClient(contract, {
        transport: () => {
          throw cause
        },
      })
      const result = await client.health()
      expect(result.isErr()).toBe(true)
      if (!result.isErr() || result.error.kind !== 'request') throw new Error('Expected request failure')
      expect(result.error.cause).toBe(cause)
    }
  )

  test('captures asynchronous transport rejections and aborted fetches', async () => {
    const cause = new Error('offline')
    const client = createClient(contract, {
      transport: async () => {
        throw cause
      },
    })
    expect(await client.health()).toMatchObject({ error: { kind: 'request', cause } })
    const controller = new AbortController()
    controller.abort()
    const aborted = createClient(contract, {
      transport: fetchTransport({
        baseUrl: 'https://example.test',
        fetch: async (request) => {
          request.signal.throwIfAborted()
          return new Response('ok')
        },
      }),
    })
    expect(await aborted.health({ signal: controller.signal })).toMatchObject({
      error: { kind: 'request', cause: controller.signal.reason },
    })
  })

  test('retains unexpected-status errors and response disposal', async () => {
    const dispose = vi.fn<() => void>()
    const client = createClient(contract, {
      transport: () => ({ status: 500, headers: {}, readBody: () => undefined, dispose }),
    })
    const result = await client.health()
    if (!result.isErr() || result.error.kind !== 'request') throw new Error('Expected request failure')
    expect(result.error.cause).toBeInstanceOf(ClientResponseError)
    expect(result.error.cause).toMatchObject({ code: 'unexpected-status' })
    expect(dispose).toHaveBeenCalledOnce()
  })

  test('captures malformed declared errors and decoding failures', async () => {
    const invalidError = await httpClient(404, { code: 'OTHER' }).health()
    expect(invalidError).toMatchObject({ error: { kind: 'request', cause: { code: 'invalid-error-response' } } })
    const cause = new SyntaxError('Invalid JSON')
    const client = createClient(contract, {
      transport: () => ({
        status: 200,
        headers: { 'content-type': 'application/json' },
        readBody: () => {
          throw cause
        },
      }),
    })
    expect(await client.users.get({ params: { id: 'one' } })).toMatchObject({ error: { kind: 'request', cause } })
  })

  test('infers context and captures middleware failures', async () => {
    const cause = new Error('middleware failed')
    const client = createClient(contract, {
      transport: transport(204),
      context: async () => ({ token: 'secret' }),
      middleware: [
        ({ context }) => {
          expectTypeOf(context.token).toEqualTypeOf<string>()
          throw cause
        },
      ],
    })
    expect(await client.health()).toMatchObject({ error: { kind: 'request', cause } })
  })

  test('supports selected routes, selected routers, and immutable nested trees', async () => {
    const selectedRoute = createClient(contract.routes.users.get, { transport: transport(200, { id: 'one' }) })
    const selectedRouter = createClient(contract.routes.users, { transport: transport(200, { id: 'one' }) })
    expect((await selectedRoute({ params: { id: 'one' } })).isOk()).toBe(true)
    expect((await selectedRouter.get({ params: { id: 'one' } })).isOk()).toBe(true)
    expect(Object.isFrozen(selectedRouter)).toBe(true)
    expect(Object.isFrozen(httpClient(204).users)).toBe(true)
  })

  test('keeps lazy stream failures on the stream and disposes it', async () => {
    const streaming = defineContract({
      routes: { events: route.get('/events', { responses: { 200: response.stream() } }) },
    })
    const cause = new Error('stream failed')
    const dispose = vi.fn<() => void>()
    async function* stream() {
      yield 'first'
      throw cause
    }
    const client = createClient(streaming, {
      transport: () => ({
        status: 200,
        headers: { 'content-type': 'application/octet-stream' },
        readBody: stream,
        dispose,
      }),
    })
    const result = await client.events()
    expect(result.isOk()).toBe(true)
    if (!result.isOk()) throw new Error('Expected stream success')
    const iterator = result.value.body[Symbol.asyncIterator]()
    expect(await iterator.next()).toMatchObject({ value: 'first', done: false })
    await expect(iterator.next()).rejects.toBe(cause)
    expect(dispose).toHaveBeenCalledOnce()
  })

  test('preserves structured codec validation errors', async () => {
    const schema = codec(z.string(), z.date(), {
      decode: (value) => new Date(value),
      encode: (value) => value.toISOString(),
    })
    const dates = defineContract({
      routes: { date: route.get('/date', { responses: { 200: response.json(schema) } }) },
    })
    const client = createClient(dates, { transport: transport(200, 'not a date') })
    expect(await client.date()).toMatchObject({ error: { kind: 'request', cause: { code: 'schema-validation' } } })
  })

  test('captures context failures before sending a request', async () => {
    const send = vi.fn<ClientTransport>(transport(204))
    const cause = new Error('context failed')
    const client = createClient(contract, {
      transport: send,
      context: (): Record<string, never> => {
        throw cause
      },
    })
    expect(await client.health()).toMatchObject({ error: { kind: 'request', cause } })
    expect(send).not.toHaveBeenCalled()
  })

  test('roundtrips thrown server declarations without altering the standard client', async () => {
    const server = defineServer(contract).implement({
      health: ({ response }) => response(204),
      users: {
        get: ({ errors }) => {
          throw errors.NOT_FOUND({ data: { id: 'missing' } })
        },
      },
    })
    const options = {
      transport: fetchTransport({ baseUrl: 'https://example.test', fetch: fetchAdapter().mount(server) }),
    }
    const result = await createClient(contract, options).users.get({ params: { id: 'missing' } })
    expect(result).toMatchObject({
      error: { kind: 'http', response: { status: 404, body: { code: 'NOT_FOUND', data: { id: 'missing' } } } },
    })
    expect(await createAPIClient(contract, options).health()).toMatchObject({ status: 204 })
  })
})

// Compile-time checks are run by the package's typecheck script.
function typeChecks() {
  const client = httpClient(204)
  // @ts-expect-error Required route input is retained.
  void client.users.get()
  // @ts-expect-error Parameter types are retained.
  void client.users.get({ params: { id: 1 } })
  // @ts-expect-error Result clients always use return mode internally.
  createClient(contract, { transport: transport(204), errorMode: 'throw' })
  type SuccessOnly = ClientResult<{ status: 200; body: string }>
  expectTypeOf<Extract<SuccessOnly, { error: unknown }>['error']>().toEqualTypeOf<RequestFailure>()
}
void typeChecks
