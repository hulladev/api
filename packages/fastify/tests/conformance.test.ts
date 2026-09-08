import Fastify from 'fastify'
import { adapterConformance } from '../../../scripts/adapter-conformance'
import { listenConformanceServer } from '../../../scripts/conformance-http'
import { fastifyAdapter } from '../src'

adapterConformance({
  name: 'Fastify',
  formData: 'Multipart parsing requires a host plugin',
  cancellation: true,
  malformedJson: true,
  async open(implementation) {
    const app = Fastify()
    app.addContentTypeParser('application/octet-stream', { parseAs: 'buffer' }, (_request, body, done) =>
      done(null, body)
    )
    fastifyAdapter(app).mount(implementation)
    await app.ready()
    const host = await listenConformanceServer(app.server)
    return {
      ...host,
      async close() {
        await host.close()
        await app.close()
      },
    }
  },
})
