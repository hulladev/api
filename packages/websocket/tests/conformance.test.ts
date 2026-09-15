import { once } from 'node:events'
import { WebSocket, WebSocketServer } from 'ws'
import { adapterConformance } from '../../../scripts/adapter-conformance'
import { webSocketAdapter, webSocketTransport } from '../src'

adapterConformance({
  name: 'WebSocket',
  formData: true,
  cancellation: true,
  malformedJson: 'WebSocket wire frames are checked by protocol tests, not an HTTP JSON parser',
  async open(implementation) {
    const server = new WebSocketServer({ port: 0, host: '127.0.0.1' })
    await once(server, 'listening')
    const address = server.address()
    if (address === null || typeof address === 'string') throw new Error('Expected a TCP address')
    const connected = once(server, 'connection')
    const socket = new WebSocket(`ws://127.0.0.1:${address.port}`)
    const transport = webSocketTransport(socket)
    const [accepted] = (await connected) as [WebSocket]
    const mounted = webSocketAdapter(accepted).mount(implementation)
    await Promise.all([transport.ready, mounted.ready])
    return {
      transport,
      async close() {
        await transport.close()
        await mounted.close()
        socket.terminate()
        accepted.terminate()
        await new Promise<void>((resolve, reject) => server.close((error) => (error ? reject(error) : resolve())))
      },
    }
  },
})
