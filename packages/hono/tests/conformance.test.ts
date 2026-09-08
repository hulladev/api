import { fetchTransport } from '@hulla/api/fetch'
import { Hono } from 'hono'
import { adapterConformance } from '../../../scripts/adapter-conformance'
import { honoAdapter } from '../src'

adapterConformance({
  name: 'Hono',
  formData: true,
  cancellation: true,
  malformedJson: true,
  open(implementation) {
    const app = new Hono()
    honoAdapter(app).mount(implementation)
    const http = async (request: Request) => app.fetch(request)
    return { transport: fetchTransport({ baseUrl: 'http://conformance.test', fetch: http }), http, close() {} }
  },
})
