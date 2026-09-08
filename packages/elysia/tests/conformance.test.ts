import { fetchTransport } from '@hulla/api/fetch'
import { Elysia } from 'elysia'
import { adapterConformance } from '../../../scripts/adapter-conformance'
import { elysiaAdapter } from '../src'

adapterConformance({
  name: 'Elysia',
  formData: true,
  cancellation: true,
  malformedJson: true,
  open(implementation) {
    const app = new Elysia()
    elysiaAdapter(app).mount(implementation)
    const http = async (request: Request) => app.handle(request)
    return { transport: fetchTransport({ baseUrl: 'http://localhost', fetch: http }), http, close() {} }
  },
})
