import { expect, expectTypeOf, test } from 'vitest'
import { z } from 'zod'
import { defineContract, request, response, route } from '../src'
import { createClient } from '../src/client'
import { fetchAdapter, fetchTransport } from '../src/fetch'
import { defineServer } from '../src/server'

test('type-only JSON declarations retain types and use native serialization', async () => {
  type Payload = { count: number; omitted?: string | undefined }
  const contract = defineContract({
    routes: {
      echo: route.post('/echo', { body: request.json<Payload>(), responses: { 200: response.json<Payload>() } }),
    },
  })
  const implementation = defineServer(contract).implement({
    echo: ({ body }) => {
      expectTypeOf(body).toEqualTypeOf<Payload>()
      return { status: 200, body }
    },
  })
  const client = createClient(contract, {
    transport: fetchTransport({ baseUrl: 'https://native.test', fetch: fetchAdapter().mount(implementation) }),
  })
  const result = await client.echo({ body: { count: 42 } })
  expectTypeOf(result.body).toEqualTypeOf<Payload>()
  expect(result.body).toEqual({ count: 42 })
  // Native JSON omits undefined object fields instead of running a recursive preflight.
  const input = { count: 42, omitted: undefined }
  expect((await client.echo({ body: input })).body).toEqual({ count: 42 })
})

test('explicit schemas still validate incoming values', async () => {
  const contract = defineContract({
    routes: {
      echo: route.post('/echo', {
        body: request.json(z.object({ count: z.number().positive() })),
        responses: { 200: response.json<{ count: number }>() },
      }),
    },
  })
  let calls = 0
  const handler = fetchAdapter().mount(
    defineServer(contract).implement({
      echo: ({ body }) => {
        calls++
        return { status: 200, body }
      },
    })
  )
  const result = await handler(
    new Request('https://native.test/echo', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: '{"count":-1}',
    })
  )
  expect(result.status).toBe(400)
  expect(calls).toBe(0)
})

test('native JSON parsing still rejects malformed bodies without a schema', async () => {
  const contract = defineContract({
    routes: {
      echo: route.post('/echo', { body: request.json<{ count: number }>(), responses: { 204: response.empty() } }),
    },
  })
  let calls = 0
  const handler = fetchAdapter().mount(
    defineServer(contract).implement({
      echo: () => {
        calls++
        return { status: 204 }
      },
    })
  )
  const result = await handler(
    new Request('https://native.test/echo', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: '{broken',
    })
  )
  expect(result.status).toBe(400)
  expect(calls).toBe(0)
})

test('configured headers are captured at construction; dynamic headers remain per call', async () => {
  const contract = defineContract({ routes: { get: route.get('/', { responses: { 204: response.empty() } }) } })
  const headers = { 'X-Token': 'first' }
  const seen: string[] = []
  const transport = (request: { headers: Record<string, string> }) => {
    seen.push(request.headers['x-token']!)
    return { status: 204, headers: {}, readBody: () => undefined }
  }
  const fixed = createClient(contract, { headers, transport })
  const dynamic = createClient(contract, { headers: () => headers, transport })
  headers['X-Token'] = 'second'
  await fixed.get()
  await dynamic.get()
  expect(seen).toEqual(['first', 'second'])
})
