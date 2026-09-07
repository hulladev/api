import { defineContract, response, route } from '@hulla/api'
import { defineClient } from '@hulla/api/client'
import { fetchAdapter } from '@hulla/api/fetch'
import { defineServer } from '@hulla/api/server'
import { describe, expect, test, vi } from 'vitest'
import { z } from 'zod'
import { createSvelteKitRemoteTransport } from '../src/remote-runtime'
import { svelteKitAdapter, type SvelteKitRequestEvent } from '../src/server'

const contract = defineContract({
  routes: {
    profile: route.get('/profile', {
      responses: { 200: response.json(z.object({ actor: z.string(), requestMethod: z.string() })) },
    }),
    rename: route.post('/profile', {
      body: z.object({ name: z.string() }),
      responses: { 200: response.json(z.object({ name: z.string() })) },
    }),
  },
})

function requestEvent(request: Request, overrides: Partial<SvelteKitRequestEvent> = {}): SvelteKitRequestEvent {
  return {
    locals: {},
    params: {},
    request,
    route: { id: '/profile' },
    url: new URL(request.url),
    ...overrides,
  } as unknown as SvelteKitRequestEvent
}

describe('SvelteKit remote-function transport', () => {
  test('executes contract calls without Fetch and exposes the current native request event', async () => {
    const adapter = svelteKitAdapter()
    const implementation = defineServer(contract, {
      context: adapter.context(({ request, svelteKitEvent }) => ({
        actor: svelteKitEvent.locals.actor ?? 'anonymous',
        requestMethod: request.method,
      })),
    }).implement({
      profile: ({ context }) => ({ status: 200, body: context }),
      rename: ({ body }) => ({ status: 200, body }),
    })
    const event = requestEvent(new Request('https://example.com/_app/remote', { method: 'POST' }), {
      locals: { actor: 'Ada' },
    })
    const getRequestEvent = vi.fn<() => SvelteKitRequestEvent>(() => event)
    const transport = createSvelteKitRemoteTransport(implementation, getRequestEvent)
    const client = defineClient(contract, { transport })

    await expect(client.profile()).resolves.toEqual({
      status: 200,
      headers: { 'content-type': 'application/json' },
      body: { actor: 'Ada', requestMethod: 'POST' },
    })
    await expect(client.rename({ body: { name: 'Grace' } })).resolves.toEqual({
      status: 200,
      headers: { 'content-type': 'application/json' },
      body: { name: 'Grace' },
    })
    expect(getRequestEvent).toHaveBeenCalledTimes(2)
  })

  test('keeps context-free implementations request-independent for prerender callbacks', async () => {
    const queryContract = defineContract({
      routes: { search: route.query('/search', { responses: { 200: response.json(z.literal('result')) } }) },
    })
    const implementation = defineServer(queryContract).implement({
      search: () => ({ status: 200, body: 'result' }),
    })
    const getRequestEvent = vi.fn<() => SvelteKitRequestEvent>(() => {
      throw new Error('request event should not be read')
    })
    const client = defineClient(queryContract, {
      transport: createSvelteKitRemoteTransport(implementation, getRequestEvent),
    })

    await expect(client.search()).resolves.toEqual({
      status: 200,
      headers: { 'content-type': 'application/json' },
      body: 'result',
    })
    expect(getRequestEvent).not.toHaveBeenCalled()
  })

  test('mounts implementation fragments', async () => {
    const fragment = defineServer(contract).implement(contract.routes.profile, () => ({
      status: 200,
      body: { actor: 'fragment', requestMethod: 'none' },
    }))
    const client = defineClient(contract, {
      transport: createSvelteKitRemoteTransport(fragment, () => {
        throw new Error('request event should not be read')
      }),
    }).select(contract.routes.profile)

    await expect(client()).resolves.toEqual({
      status: 200,
      headers: { 'content-type': 'application/json' },
      body: { actor: 'fragment', requestMethod: 'none' },
    })
  })

  test('rejects an implementation bound to a different adapter', () => {
    const adapter = fetchAdapter()
    const implementation = defineServer(contract, {
      context: adapter.context(({ request }) => ({ method: request.method })),
    }).implement({
      profile: ({ context }) => ({
        status: 200,
        body: { actor: 'fetch', requestMethod: context.method },
      }),
      rename: ({ body }) => ({ status: 200, body }),
    })

    expect(() =>
      createSvelteKitRemoteTransport(implementation as never, () => requestEvent(new Request('https://x')))
    ).toThrow('Server requires the fetch adapter, but was mounted with sveltekit')
  })
})
