import assert from 'node:assert/strict'
import { once } from 'node:events'
import { defineContract, request, response, route } from '@hulla/api'
import { webSocketAdapter, webSocketTransport } from '@hulla/api-websocket'
import { createClient } from '@hulla/api/client'
import { defineServer } from '@hulla/api/server'
import { WebSocketServer, type WebSocket as AcceptedSocket } from 'ws'
const contract = defineContract({
  routes: { echo: route.post('/echo', { body: request.bytes(), responses: { 200: response.bytes() } }) },
})
const server = new WebSocketServer({ port: 0, host: '127.0.0.1' })
await once(server, 'listening')
const address = server.address()
assert(address && typeof address !== 'string')
const connection = once(server, 'connection')
const socket = new WebSocket(`ws://127.0.0.1:${address.port}`)
const transport = webSocketTransport(socket)
const [accepted] = (await connection) as [AcceptedSocket]
const adapter = webSocketAdapter(accepted)
const mounted = adapter.mount(
  defineServer(contract, {
    context: adapter.context(({ socket }) => {
      assert.equal(socket, accepted)
      return {}
    }),
  }).implement({ echo: ({ body }) => ({ status: 200, body }) })
)
export const client = createClient(contract, { transport })
try {
  await Promise.all([mounted.ready, transport.ready])
  assert.deepEqual((await client.echo({ body: new Uint8Array([0, 128, 255]) })).body, new Uint8Array([0, 128, 255]))
} finally {
  await transport.close()
  await mounted.close()
  socket.close()
  accepted.terminate()
  await new Promise<void>((resolve, reject) => server.close((error) => (error ? reject(error) : resolve())))
}
