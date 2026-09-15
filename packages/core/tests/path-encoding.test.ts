import { expect, test, vi } from 'vitest'
import { z } from 'zod'
import { defineContract, response, route, router } from '../src'
import { createClient } from '../src/client'
import { fetchAdapter, fetchTransport } from '../src/fetch'
import { defineServer } from '../src/server'

test.each(['/literal%', '/literal%25', '/%GG', '/safe/%2e%2e/target', '/.%2E', '/%2f'])(
  'rejects percent signs in all declared path positions: %s',
  (path) => {
    const item = route.get('/item', { responses: { 200: response.text() } })
    expect(() => route.get(path, { responses: { 200: response.text() } })).toThrow('cannot contain percent signs')
    expect(() => router(path, { routes: { item } })).toThrow('cannot contain percent signs')
    expect(() => defineContract({ basePath: path, routes: { item } })).toThrow('cannot contain percent signs')
  }
)

test.each(['/a\tb', '/a\nb', '/a\rb', '/a\u0000b'])('rejects control characters in paths: %j', (path) => {
  expect(() => route.get(path, { responses: { 200: response.text() } })).toThrow('cannot contain control characters')
})

test('round-trips literal percent values and encoded separators through path parameters', async () => {
  const contract = defineContract({
    routes: {
      item: route.get('/items/:id', {
        params: z.object({ id: z.string() }),
        responses: { 200: response.text() },
      }),
    },
  })
  const handler = fetchAdapter().mount(
    defineServer(contract).implement({
      item: ({ params }) => ({ status: 200, body: params.id }),
    })
  )
  const client = createClient(contract, {
    transport: fetchTransport({ baseUrl: 'https://example.test', fetch: handler }),
  })
  for (const id of ['%', '%25', '%GG', '%2e%2e', 'a/b', '雪']) {
    expect((await client.item({ params: { id } })).body).toBe(id)
  }
})

test.each(['get', 'delete'] as const)('%s rejects dot path parameters before sending a request', async (method) => {
  const contract = defineContract({
    routes: {
      item: route[method]('/items/:id', {
        params: z.object({ id: z.string() }),
        responses: { 200: response.text() },
      }),
    },
  })
  const fetch = vi.fn<(request: Request) => Response>(
    () => new Response('ok', { headers: { 'content-type': 'text/plain' } })
  )
  const client = createClient(contract, { transport: fetchTransport({ baseUrl: 'https://example.test/api', fetch }) })
  for (const id of ['.', '..']) {
    await expect(client.item({ params: { id } })).rejects.toThrow('cannot be a dot segment')
  }
  expect(fetch).not.toHaveBeenCalled()
  await client.item({ params: { id: 'v1.2' } })
  expect(fetch).toHaveBeenCalledWith(
    expect.objectContaining({ url: 'https://example.test/api/items/v1.2', method: method.toUpperCase() })
  )
})
