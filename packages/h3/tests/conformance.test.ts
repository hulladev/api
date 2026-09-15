import { fetchTransport } from '@hulla/api/fetch'
import { H3 } from 'h3'
import { adapterConformance } from '../../../scripts/adapter-conformance'
import { h3Adapter } from '../src'

adapterConformance({
  name: 'H3',
  encodedSlash: { value: '%2F', reason: 'H3 safe parameter decoding preserves encoded slashes' },
  formData: true,
  cancellation: true,
  malformedJson: true,
  open(implementation) {
    const app = new H3()
    h3Adapter(app).mount(implementation)
    const http = async (request: Request) => app.request(request)
    return { transport: fetchTransport({ baseUrl: 'http://conformance.test', fetch: http }), http, close() {} }
  },
})
