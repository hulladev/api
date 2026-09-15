import assert from 'node:assert/strict'
import { MessageChannel } from 'node:worker_threads'
import { defineContract, response, route } from '@hulla/api'
import { messagePortAdapter, messagePortTransport } from '@hulla/api-message-port'
import { createClient } from '@hulla/api/client'
import { defineServer } from '@hulla/api/server'
const contract = defineContract({ routes: { health: route.get('/health', { responses: { 200: response.text() } }) } })
const channel = new MessageChannel()
const server = messagePortAdapter(channel.port1).mount(
  defineServer(contract).implement({ health: () => ({ status: 200, body: 'ok' }) })
)
const transport = messagePortTransport(channel.port2)
export const client = createClient(contract, { transport })
try {
  await Promise.all([server.ready, transport.ready])
  assert.equal((await client.health()).body, 'ok')
} finally {
  await transport.close()
  await server.close()
  channel.port1.close()
  channel.port2.close()
}

const { encodeDesktopMessage, decodeDesktopMessage } = await import('@hulla/api-message-port/desktop')
const { electronEndpoint } = await import('@hulla/api-message-port/electron')
const { tauriEndpoint } = await import('@hulla/api-message-port/tauri')
const { dioxusEndpoint } = await import('@hulla/api-message-port/dioxus')
assert.deepEqual(decodeDesktopMessage(await encodeDesktopMessage({ bytes: new Uint8Array([0, 255]) })), {
  bytes: new Uint8Array([0, 255]),
})
assert.equal(typeof electronEndpoint, 'function')
assert.equal(typeof tauriEndpoint, 'function')
assert.equal(typeof dioxusEndpoint, 'function')
