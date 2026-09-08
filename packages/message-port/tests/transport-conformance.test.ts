import { MessageChannel } from 'node:worker_threads'
import { fetchAdapter, fetchTransport } from '@hulla/api/fetch'
import { inProcessTransport } from '@hulla/api/in-process'
import { adapterConformance } from '../../../scripts/adapter-conformance'
import { messagePortAdapter, messagePortTransport } from '../src'

adapterConformance({
  name: 'Fetch',
  formData: true,
  cancellation: true,
  malformedJson: true,
  open(implementation) {
    const http = fetchAdapter().mount(implementation)
    return { transport: fetchTransport({ baseUrl: 'http://conformance.test', fetch: http }), http, close() {} }
  },
})
adapterConformance({
  name: 'In-process',
  formData: true,
  cancellation: true,
  malformedJson: 'Application values have no JSON text parser',
  open: (implementation) => ({ transport: inProcessTransport(implementation), close() {} }),
})
adapterConformance({
  name: 'MessagePort',
  formData: true,
  cancellation: true,
  malformedJson: 'Structured-clone messages have no JSON text parser',
  async open(implementation) {
    const channel = new MessageChannel()
    const mounted = messagePortAdapter(channel.port1).mount(implementation)
    const transport = messagePortTransport(channel.port2)
    await Promise.all([mounted.ready, transport.ready])
    return {
      transport,
      async close() {
        await transport.close()
        await mounted.close()
        channel.port1.close()
        channel.port2.close()
      },
    }
  },
})
