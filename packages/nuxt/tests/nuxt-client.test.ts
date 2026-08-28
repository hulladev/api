import { defineContract, response, route } from '@hulla/api'
import { defineClient } from '@hulla/api/client'
import { createFetch } from 'ofetch'
import { describe, expect, test, vi } from 'vitest'
import { z } from 'zod'
import { nuxtFetchTransport, type NuxtRequestFetch } from '../src/client'

const contract = defineContract({
  basePath: '/api',
  routes: {
    search: route.get('/search', {
      query: z.object({ tag: z.array(z.string()), term: z.string() }),
      responses: { 200: response.json(z.object({ ok: z.literal(true) })) },
    }),
    rename: route.post('/users', {
      body: z.object({ name: z.string() }),
      responses: {
        200: response.json(z.object({ name: z.string() })),
        422: response.json(z.object({ message: z.string() })),
      },
    }),
  },
})

type RawCall = {
  readonly options: Readonly<Record<string, unknown>>
  readonly url: string
}

function requestFetch(respond: (call: RawCall) => Response): {
  readonly calls: RawCall[]
  readonly fetcher: NuxtRequestFetch
} {
  const calls: RawCall[] = []
  return {
    calls,
    fetcher: {
      raw: vi.fn<(url: string, options: Readonly<Record<string, unknown>>) => Promise<Response>>(
        async (url, options) => {
          const call = { options, url }
          calls.push(call)
          return respond(call)
        }
      ),
    } as unknown as NuxtRequestFetch,
  }
}

describe('Nuxt fetch transport', () => {
  test('preserves an actual ofetch raw body for Hulla response decoding', async () => {
    const fetcher = createFetch({
      fetch: async () => Response.json({ message: 'Name is unavailable' }, { status: 422 }),
    })
    const client = defineClient(contract, { transport: nuxtFetchTransport(fetcher) }).create()

    await expect(client.rename({ body: { name: 'Ada' } })).resolves.toEqual({
      status: 422,
      headers: { 'content-type': 'application/json' },
      body: { message: 'Name is unavailable' },
    })
  })

  test('uses a relative request-aware raw fetch and preserves repeated query fields', async () => {
    const request = requestFetch(() => Response.json({ ok: true }))
    const client = defineClient(contract, { transport: nuxtFetchTransport(request.fetcher) }).create()

    await expect(client.search({ query: { tag: ['typed', 'nuxt'], term: 'hulla api' } })).resolves.toEqual({
      status: 200,
      headers: { 'content-type': 'application/json' },
      body: { ok: true },
    })

    expect(request.calls).toHaveLength(1)
    expect(request.calls[0]?.url).toBe('/api/search?tag=typed&tag=nuxt&term=hulla+api')
    expect(request.calls[0]?.options).toMatchObject({
      ignoreResponseError: true,
      method: 'GET',
      responseType: 'stream',
      retry: false,
    })
  })

  test('retains non-success statuses and sends the encoded contract body', async () => {
    const request = requestFetch(() => Response.json({ message: 'Name is unavailable' }, { status: 422 }))
    const client = defineClient(contract, {
      transport: nuxtFetchTransport(request.fetcher, { baseUrl: '/internal' }),
    }).create()

    await expect(client.rename({ body: { name: 'Ada' } })).resolves.toEqual({
      status: 422,
      headers: { 'content-type': 'application/json' },
      body: { message: 'Name is unavailable' },
    })

    expect(request.calls[0]?.url).toBe('/internal/api/users')
    expect(request.calls[0]?.options).toMatchObject({
      body: JSON.stringify({ name: 'Ada' }),
      headers: { 'content-type': 'application/json' },
      method: 'POST',
    })
  })

  test('passes abort signals through and rejects an already aborted call', async () => {
    const request = requestFetch(() => Response.json({ ok: true }))
    const client = defineClient(contract, { transport: nuxtFetchTransport(request.fetcher) }).create()
    const active = new AbortController()

    await client.search({ query: { tag: ['one'], term: 'active' } }, { signal: active.signal })
    expect(request.calls[0]?.options).toMatchObject({ signal: active.signal })

    const aborted = new AbortController()
    aborted.abort(new Error('cancelled'))
    await expect(
      client.search({ query: { tag: ['one'], term: 'aborted' } }, { signal: aborted.signal })
    ).rejects.toThrow('cancelled')
    expect(request.calls).toHaveLength(1)
  })

  test('rejects base URLs containing query strings or fragments', () => {
    const request = requestFetch(() => Response.json({ ok: true }))

    expect(() => nuxtFetchTransport(request.fetcher, { baseUrl: '/api?tenant=one' })).toThrow(
      'cannot contain a query string'
    )
    expect(() => nuxtFetchTransport(request.fetcher, { baseUrl: '/api#fragment' })).toThrow(
      'cannot contain a hash fragment'
    )
  })
})
