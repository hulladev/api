import assert from 'node:assert/strict'
import { defineContract, response, route } from '@hulla/api'
import { nuxtAdapter } from '@hulla/api-nuxt/server'
import { defineServer } from '@hulla/api/server'
import { createApp, toWebHandler } from 'h3'
const contract = defineContract({ routes: { health: route.get('/health', { responses: { 200: response.text() } }) } })
const adapter = nuxtAdapter()
export const handler = adapter.mount(
  defineServer(contract, { context: adapter.context(({ nuxtEvent }) => ({ method: nuxtEvent.method })) }).implement({
    health: ({ context }) => ({ status: 200, body: context.method }),
  })
)
const app = createApp().use(handler)
const result = await toWebHandler(app)(new Request('http://consumer.test/health'))
assert.equal(result.status, 200)
assert.equal(await result.text(), 'GET')
