import { expect, test, vi } from 'vitest'
import { z } from 'zod'
import { defineContract, response, route } from '../src'
import { createAdapterHandler } from '../src/adapters'
import { defineClient } from '../src/client'
import { fetchTransportResponse } from '../src/fetch/client'
import { defineServer } from '../src/server'
import { asyncSchema } from '../src/validation'

test('Fetch headers preserve snapshot, repeated cookies and stable record identity', () => {
  const native = Response.json(
    { ok: true },
    {
      headers: [
        ['set-cookie', 'a=1'],
        ['set-cookie', 'b=2'],
        ['x-id', 'first'],
      ],
    }
  )
  const wire = fetchTransportResponse(native)
  native.headers.set('x-id', 'later')
  native.headers.set('content-type', 'text/plain')
  expect(wire.headers['x-id']).toBe('first')
  expect(wire.headers['content-type']).toBe('application/json')
  expect(wire.headers['set-cookie']).toEqual(['a=1', 'b=2'])
  expect(wire.headers).toBe(wire.headers)
})

test('decoded response headers remain enumerable and preserve metadata', async () => {
  const contract = defineContract({
    routes: { item: route.get('/', { responses: { 200: response.json(z.object({ ok: z.boolean() })) } }) },
  })
  const wire = fetchTransportResponse(Response.json({ ok: true }, { headers: { 'x-id': 'value' } }))
  const client = defineClient(contract, { transport: () => wire })
  const result = await client.item()
  expect(result.body).toEqual({ ok: true })
  expect(Object.keys(result)).toEqual(['status', 'headers', 'body'])
  expect({ ...result }.headers['x-id']).toBe('value')
  expect(JSON.parse(JSON.stringify(result)).headers['x-id']).toBe('value')
})

test('wrong content type cancels an unread response', async () => {
  const cancel = vi.fn<() => void>()
  const native = new Response(new ReadableStream({ cancel }), { headers: { 'content-type': 'text/plain' } })
  const contract = defineContract({ routes: { item: route.get('/', { responses: { 200: response.json() } }) } })
  const client = defineClient(contract, { transport: () => fetchTransportResponse(native) })
  await expect(client.item()).rejects.toMatchObject({ code: 'content-type-mismatch' })
  expect(cancel).toHaveBeenCalledOnce()
})

test('simple server routes preserve all synchronous/asynchronous stage combinations', async () => {
  for (let mask = 0; mask < 8; mask++) {
    const contract = defineContract({
      routes: {
        item: route.post('/', {
          body: mask & 1 ? asyncSchema(z.string()) : z.string(),
          responses: { 200: response.json(mask & 4 ? asyncSchema(z.string()) : z.string()) },
        }),
      },
    })
    const handler = ({ body }: { body: string }) => ({ status: 200 as const, body })
    const dispatch = createAdapterHandler(
      defineServer(contract).implement({ item: mask & 2 ? async (input) => handler(input) : handler })
    )
    await expect(
      dispatch({ request: {}, method: 'POST', pathname: '/', body: { value: 'ok', contentType: 'application/json' } })
    ).resolves.toMatchObject({ status: 200, body: { value: 'ok' } })
  }
})

test.each(['request', 'handler', 'response'] as const)(
  'simple route preserves %s error phases and replacements',
  async (failure) => {
    for (const asynchronous of [false, true]) {
      const input = z.string().refine(() => failure !== 'request')
      const output = z.string().refine(() => failure !== 'response')
      const contract = defineContract({
        routes: {
          item: route.post('/', {
            body: asynchronous ? asyncSchema(input) : input,
            responses: { 200: response.json(asynchronous ? asyncSchema(output) : output) },
          }),
        },
      })
      const handler = ({ body }: { body: string }) => {
        if (failure === 'handler') throw new Error('failure')
        return { status: 200 as const, body }
      }
      const onError = vi.fn<
        () => { status: number; headers: Record<string, string>; body: { kind: 'text'; value: string } }
      >(() => ({ status: 503, headers: {}, body: { kind: 'text' as const, value: 'replacement' } }))
      const dispatch = createAdapterHandler(
        defineServer(contract).implement({ item: asynchronous ? async (input) => handler(input) : handler }),
        { onError }
      )
      expect(
        (
          await dispatch({
            request: {},
            method: 'POST',
            pathname: '/',
            body: { value: 'ok', contentType: 'application/json' },
          })
        ).status
      ).toBe(503)
      expect(onError).toHaveBeenCalledExactlyOnceWith(expect.objectContaining({ phase: failure }))
    }
  }
)

test('simple route observes abort after asynchronous input before calling handler', async () => {
  const controller = new AbortController()
  const input = z.string().refine(async () => {
    controller.abort()
    return true
  })
  const contract = defineContract({
    routes: { item: route.post('/', { body: input, responses: { 200: response.json() } }) },
  })
  const handler = vi.fn<() => { status: 200; body: string }>(() => ({ status: 200, body: 'unexpected' }))
  const onError = vi.fn<() => void>()
  await createAdapterHandler(defineServer(contract).implement({ item: handler }), { onError })({
    request: {},
    method: 'POST',
    pathname: '/',
    signal: controller.signal,
    body: { value: 'ok', contentType: 'application/json' },
  })
  expect(handler).not.toHaveBeenCalled()
  expect(onError).toHaveBeenCalledWith(expect.objectContaining({ phase: 'context' }))
})
