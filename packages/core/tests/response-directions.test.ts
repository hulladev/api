import { expect, expectTypeOf, test, vi } from 'vitest'
import { z } from 'zod'
import { defineContract, defineErrors, request, response, route } from '../src'
import { createClient } from '../src/client'
import { fetchAdapter, fetchTransport } from '../src/fetch'
import { inProcessTransport } from '../src/in-process'
import { defineServer } from '../src/server'
import { ndjson } from '../src/stream'
import { codec } from '../src/validation'

test.each(['fetch', 'in-process'] as const)('transforms server boundaries once over %s', async (kind) => {
  const input = vi.fn<(value: string) => number>((value: string) => Number(value))
  const output = vi.fn<(value: number) => string>((value: number) => String(value))
  const header = vi.fn<(value: number) => string>((value: number) => String(value))
  const contract = defineContract({
    routes: {
      double: route.post('/double', {
        body: request.json(z.object({ quantity: z.string().transform(input) })),
        responses: {
          200: response.json(z.object({ doubled: z.number().transform(output) }), {
            headers: z.object({ 'x-count': z.number().transform(header) }),
          }),
        },
      }),
      tomorrow: route.post('/tomorrow', {
        body: request.json(z.object({ at: z.iso.datetime().transform((value) => new Date(value)) })),
        responses: { 200: response.json(z.object({ at: z.date().transform((value) => value.toISOString()) })) },
      }),
    },
  })
  const implementation = defineServer(contract).implement({
    double: ({ body }) => {
      expectTypeOf(body.quantity).toEqualTypeOf<number>()
      return { status: 200, body: { doubled: body.quantity * 2 }, headers: { 'x-count': 1 } }
    },
    tomorrow: ({ body }) => {
      expectTypeOf(body.at).toEqualTypeOf<Date>()
      return { status: 200, body: { at: new Date(body.at.getTime() + 86_400_000) } }
    },
  })
  const client = createClient(contract, {
    transport:
      kind === 'fetch'
        ? fetchTransport({ baseUrl: 'https://directions.test', fetch: fetchAdapter().mount(implementation) })
        : inProcessTransport(implementation),
  })
  const result = await client.double({ body: { quantity: '2' } })
  expectTypeOf(result.body).toEqualTypeOf<{ doubled: string }>()
  expectTypeOf(result.headers).toEqualTypeOf<{ 'x-count': string }>()
  expect(result.body).toEqual({ doubled: '4' })
  expect(result.headers['x-count']).toBe('1')
  expect(input).toHaveBeenCalledOnce()
  expect(output).toHaveBeenCalledOnce()
  expect(header).toHaveBeenCalledOnce()
  const dated = await client.tomorrow({ body: { at: '2026-09-09T12:00:00.000Z' } })
  expectTypeOf(dated.body.at).toEqualTypeOf<string>()
  expect(dated.body.at).toBe('2026-09-10T12:00:00.000Z')
})

test('codecs reconstruct dates after native JSON parsing in both directions', async () => {
  const encode = vi.fn<(value: { at: Date }) => { at: string }>(({ at }: { at: Date }) => ({ at: at.toISOString() }))
  const decode = vi.fn<(value: { at: string }) => { at: Date }>(({ at }: { at: string }) => ({ at: new Date(at) }))
  const dated = codec(z.object({ at: z.iso.datetime() }), z.object({ at: z.date() }), { encode, decode })
  const contract = defineContract({
    routes: {
      tomorrow: route.post('/', {
        body: request.json(dated),
        responses: { 200: response.json(dated) },
      }),
    },
  })
  const implementation = defineServer(contract).implement({
    tomorrow: ({ body }) => ({
      status: 200,
      body: { at: new Date(body.at.getTime() + 86_400_000) },
    }),
  })
  const client = createClient(contract, {
    transport: fetchTransport({
      baseUrl: 'https://directions.test',
      fetch: fetchAdapter().mount(implementation),
    }),
  })
  const result = await client.tomorrow({ body: { at: new Date('2026-09-09T12:00:00.000Z') } })
  expectTypeOf(result.body.at).toEqualTypeOf<Date>()
  expect(result.body.at).toEqual(new Date('2026-09-10T12:00:00.000Z'))
  expect(encode).toHaveBeenCalledTimes(2)
  expect(decode).toHaveBeenCalledTimes(2)
})

test('server schema output strips unknown fields and rejects invalid responses', async () => {
  const validate = vi.fn<() => boolean>(() => true)
  const contract = defineContract({
    routes: {
      get: route.get('/', {
        responses: { 200: response.json(z.object({ count: z.number() }).refine(validate)) },
      }),
    },
  })
  const handler = fetchAdapter().mount(
    defineServer(contract).implement({
      get: () => ({ status: 200, body: { count: 2, privateField: 'secret' } }),
    })
  )
  const wire = await handler(new Request('https://directions.test'))
  expect(await wire.json()).toEqual({ count: 2 })
  expect(validate).toHaveBeenCalledOnce()
  const invalid = fetchAdapter().mount(
    defineServer(contract).implement({
      get: () => ({ status: 200, body: { count: 'wrong' as never } }),
    })
  )
  expect((await invalid(new Request('https://directions.test'))).status).toBe(500)
})

test('stream items and declared error data send transformed output', async () => {
  const transform = vi.fn<(value: number) => string>((value: number) => `item-${value}`)
  const schema = z.number().transform(transform)
  const asynchronous = {
    '~standard': { ...schema['~standard'], validate: async (value: unknown) => schema['~standard'].validate(value) },
  }
  const errors = defineErrors({ BAD: { data: asynchronous } })
  const contract = defineContract({
    errors: { 400: errors.BAD },
    routes: {
      stream: route.get('/stream', { responses: { 200: response.stream(ndjson(asynchronous)) } }),
      fail: route.get('/fail', { responses: { 200: response.empty() } }),
    },
  })
  const implementation = defineServer(contract).implement({
    stream: () => ({ status: 200, body: [1, 2] }),
    fail: () => {
      throw errors.BAD({ data: 3 })
    },
  })
  const client = createClient(contract, {
    transport: fetchTransport({
      baseUrl: 'https://directions.test',
      fetch: fetchAdapter().mount(implementation),
    }),
  })
  const streamed = await client.stream()
  if (streamed.status !== 200) throw new Error('Expected stream')
  const values = []
  for await (const value of streamed.body) values.push(value)
  expect(values).toEqual(['item-1', 'item-2'])
  const failed = await client.fail()
  if (failed.status !== 400) throw new Error('Expected declared error')
  expectTypeOf(failed.body.data).toEqualTypeOf<string>()
  expect(failed.body.data).toBe('item-3')
  expect(transform).toHaveBeenCalledTimes(3)
})

test('clients trust ordinary response schemas without rerunning checks', async () => {
  const validate = vi.fn<() => boolean>(() => false)
  const contract = defineContract({
    routes: {
      get: route.get('/', {
        responses: { 200: response.json(z.number().refine(validate)) },
      }),
    },
  })
  const client = createClient(contract, {
    transport: () => ({
      status: 200,
      headers: { 'content-type': 'application/json' },
      readBody: () => 42,
    }),
  })
  expect((await client.get()).body).toBe(42)
  expect(validate).not.toHaveBeenCalled()
})

// oxlint-disable-next-line vitest/expect-expect -- Compile-time contract constraints.
test('ordinary JSON response output must be serializable', () => {
  response.json(z.date().transform((value) => value.toISOString()))
  // @ts-expect-error A Date output requires a codec to reconstruct it on the client.
  response.json(z.iso.datetime().transform((value) => new Date(value)))
  // @ts-expect-error Header outputs must be textual.
  response.empty({ headers: z.object({ count: z.number() }) })
  // @ts-expect-error Error data must have a JSON-compatible output.
  defineErrors({ BAD: { data: z.date() } })
  // @ts-expect-error Bigint output is not JSON-compatible.
  response.json(z.string().transform(BigInt))
})
