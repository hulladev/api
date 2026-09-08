import { expect, test, vi } from 'vitest'
import { z } from 'zod'
import { defineContract, response, route } from '../src'
import { createAdapterHandler } from '../src/adapters'
import { fetchAdapter } from '../src/fetch'
import { defineServer } from '../src/server'

function handler(withHeaders = false) {
  const contract = defineContract({
    routes: {
      echo: route.post('/', {
        body: z.object({ value: z.string() }),
        ...(withHeaders ? { headers: z.object({ 'x-tenant': z.string() }) } : {}),
        responses: { 200: response.json() },
      }),
    },
  })
  return createAdapterHandler(defineServer(contract).implement({ echo: ({ body }) => ({ status: 200, body }) }))
}

const input = { request: undefined, method: 'POST', pathname: '/', readBody: async () => ({ value: 'ok' }) }
const headers = { 'content-type': 'application/json', 'x-tenant': 'tenant' }

test('reads only the content type when no header schema is declared', async () => {
  const readHeaders = vi.fn<() => typeof headers>(() => headers)
  const readHeader = vi.fn<(name: string) => string | undefined>((name) => headers[name as keyof typeof headers])
  expect((await handler()({ ...input, readHeaders, readHeader })).status).toBe(200)
  expect(readHeaders).not.toHaveBeenCalled()
  expect(readHeader).toHaveBeenCalledExactlyOnceWith('content-type')
})

test('still provides the complete header record to a declared schema', async () => {
  const readHeaders = vi.fn<() => Record<string, string>>(() => ({ 'content-type': 'application/json' }))
  expect((await handler(true)({ ...input, readHeaders, readHeader: () => 'application/json' })).status).toBe(400)
  expect(readHeaders).toHaveBeenCalledOnce()
})

test('retains full-record fallback for existing adapters', async () => {
  expect((await handler()({ ...input, readHeaders: () => headers })).status).toBe(200)
})

test('an explicit header record remains authoritative over lazy readers', async () => {
  const readHeader = vi.fn<() => string>(() => 'application/json')
  const readBody = vi.fn<() => Promise<unknown>>(input.readBody)
  expect((await handler()({ ...input, headers: {}, readHeader, readBody })).status).toBe(415)
  expect(readHeader).not.toHaveBeenCalled()
  expect(readBody).not.toHaveBeenCalled()
})

test('a parsed body content type remains authoritative over request headers', async () => {
  const readHeader = vi.fn<() => string>(() => 'text/plain')
  expect(
    (
      await handler()({
        ...input,
        headers: {},
        readHeader,
        body: { value: { value: 'ok' }, contentType: 'application/json' },
      })
    ).status
  ).toBe(200)
  expect(readHeader).not.toHaveBeenCalled()
})

test('Fetch header caches remain local to each concurrent request, including query-bearing requests', async () => {
  const contract = defineContract({
    routes: {
      echo: route.post('/', {
        headers: z.object({ 'x-tenant': z.string() }).refine(async () => true),
        body: z.object({ value: z.string() }),
        responses: { 200: response.json() },
      }),
    },
  })
  const app = fetchAdapter().mount(
    defineServer(contract).implement({
      echo: ({ headers, body }) => ({ status: 200, body: { tenant: headers['x-tenant'], value: body.value } }),
    })
  )
  const results = await Promise.all(
    ['first', 'second'].map(async (tenant) => {
      const result = await app(
        new Request('https://test/?q=present', {
          method: 'POST',
          headers: { 'content-type': 'application/json', 'x-tenant': tenant },
          body: JSON.stringify({ value: tenant }),
        })
      )
      expect(result.status).toBe(200)
      return result.json()
    })
  )
  expect(results).toEqual([
    { tenant: 'first', value: 'first' },
    { tenant: 'second', value: 'second' },
  ])
})
