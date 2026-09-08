import assert from 'node:assert/strict'
import { defineContract, response, route } from '@hulla/api'
import { astroAdapter, astroInProcessTransport, type AstroContext } from '@hulla/api-astro'
import { defineClient } from '@hulla/api/client'
import { defineServer } from '@hulla/api/server'
import type { APIRoute } from 'astro'
const contract = defineContract({ routes: { health: route.get('/health', { responses: { 200: response.text() } }) } })
const adapter = astroAdapter()
const implementation = defineServer(contract, {
  context: adapter.context(({ astroContext }) => ({ path: astroContext.url.pathname })),
}).implement({ health: ({ context }) => ({ status: 200, body: context.path }) })
export const handler: APIRoute = adapter.mount(implementation)
// A minimal host-context fixture; full rendering is tested by the Astro production fixture.
const context = {
  request: new Request('http://consumer.test/health'),
  url: new URL('http://consumer.test/health'),
} as AstroContext
const result = await handler(context)
assert.equal(result.status, 200)
assert.equal(await result.text(), '/health')
const api = defineClient(contract, { transport: astroInProcessTransport(implementation, context) })
assert.equal((await api.health()).body, '/health')
