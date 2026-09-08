import assert from 'node:assert/strict'
import { createServer } from 'node:http'
import { defineContract, request, response, route } from '@hulla/api'
import { expressAdapter } from '@hulla/api-express'
import { defineClient } from '@hulla/api/client'
import { fetchTransport } from '@hulla/api/fetch'
import { defineServer } from '@hulla/api/server'
import express from 'express'

const contract = defineContract({
  routes: {
    echo: route.post('/echo/id', { body: request.json(), responses: { 200: response.json() } }),
    health: route.get('/health', { responses: { 200: response.text() } }),
  },
})
const app = express()
app.use(express.json())
const adapter = expressAdapter(app)
export const implementation = defineServer(contract, {
  context: adapter.context(({ request }) => ({ method: request.method })),
}).implement({
  echo: ({ body, context }) => ({
    status: 200,
    body: { body, method: context.method },
    headers: { 'set-cookie': ['a=1', 'b=2'] },
  }),
  health: () => ({ status: 200, body: 'ok' }),
})
adapter.mount(implementation)
const server = createServer(app)
await new Promise<void>((resolve) => server.listen(0, '127.0.0.1', resolve))
try {
  const address = server.address()
  assert(address && typeof address !== 'string')
  const baseUrl = `http://127.0.0.1:${address.port}`
  const api = defineClient(contract, { transport: fetchTransport({ baseUrl }) })
  const result = await api.echo({ body: { ok: true } })
  assert.deepEqual(result.body, { body: { ok: true }, method: 'POST' })
  assert.deepEqual(result.headers['set-cookie'], ['a=1', 'b=2'])
  const head = await fetch(`${baseUrl}/health`, { method: 'HEAD' })
  assert.equal(head.status, 200)
  assert.equal(await head.text(), '')
  const bad = await fetch(`${baseUrl}/echo/id`, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: '{',
  })
  assert.equal(bad.status, 400)
  await bad.arrayBuffer()
} finally {
  const closed = new Promise<void>((resolve, reject) => server.close((error) => (error ? reject(error) : resolve())))
  server.closeAllConnections()
  await closed
}
