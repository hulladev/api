import type { Server } from 'node:http'
import { fetchTransport } from '@hulla/api/fetch'
import type { ConformanceHost } from './adapter-conformance'

/** Use a real socket so disconnects and response backpressure exercise the host writer. */
export async function listenConformanceServer(server: Server): Promise<ConformanceHost> {
  await new Promise<void>((resolve, reject) => {
    server.once('error', reject)
    server.listen(0, '127.0.0.1', () => {
      server.off('error', reject)
      resolve()
    })
  })
  const address = server.address()
  if (!address || typeof address === 'string') throw new Error('Expected a TCP address')
  const baseUrl = `http://127.0.0.1:${address.port}`
  return {
    transport: fetchTransport({ baseUrl }),
    http: (request) =>
      fetch(new Request(new URL(new URL(request.url).pathname + new URL(request.url).search, baseUrl), request)),
    async close() {
      const closed = new Promise<void>((resolve, reject) =>
        server.close((error) => (error ? reject(error) : resolve()))
      )
      server.closeAllConnections()
      await closed
    },
  }
}
