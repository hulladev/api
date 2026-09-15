import assert from 'node:assert/strict'
import { createServer } from 'node:http'
import { defineContract, response, route } from '@hulla/api'
import { koaAdapter } from '@hulla/api-koa'
import { createClient } from '@hulla/api/client'
import { fetchTransport } from '@hulla/api/fetch'
import { defineServer } from '@hulla/api/server'
import Koa from 'koa'
const contract = defineContract({ routes: { health: route.get('/health', { responses: { 200: response.text() } }) } })
const adapter = koaAdapter<{ actor: string }>()
export const handler = adapter.mount(
  defineServer(contract, {
    context: adapter.context(({ ctx, state }) => ({ method: ctx.method, actor: state.actor })),
  }).implement({
    health: ({ context }) => ({ status: 200, body: context.method }),
  })
)
const app = new Koa<{ actor: string }>()
app.use(async (ctx, next) => {
  ctx.state.actor = 'Ada'
  await next()
})
app.use(handler)
const server = createServer(app.callback())
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
