import assert from 'node:assert/strict'
import { createServer } from 'node:http'
import { defineContract, response, route } from '@hulla/api'
import { nodeHttpAdapter } from '@hulla/api-node/http'
import { createClient } from '@hulla/api/client'
import { fetchTransport } from '@hulla/api/fetch'
import { defineServer } from '@hulla/api/server'
const contract = defineContract({ routes: { health: route.get('/health', { responses: { 200: response.text() } }) } })
const adapter = nodeHttpAdapter()
export const handler = adapter.mount(
  defineServer(contract, { context: adapter.context(({ request }) => ({ method: request.method ?? '' })) }).implement({
    health: ({ context }) => ({ status: 200, body: context.method }),
  })
)
const server = createServer(handler)
await new Promise<void>((resolve) => server.listen(0, '127.0.0.1', resolve))
try {
  const address = server.address()
  assert(address && typeof address !== 'string')
  const api = createClient(contract, { transport: fetchTransport({ baseUrl: `http://127.0.0.1:${address.port}` }) })
  assert.equal((await api.health()).body, 'GET')
} finally {
  const closed = new Promise<void>((resolve, reject) => server.close((error) => (error ? reject(error) : resolve())))
  server.closeAllConnections()
  await closed
}
