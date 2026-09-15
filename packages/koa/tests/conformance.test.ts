import { createServer } from 'node:http'
import Koa from 'koa'
import { adapterConformance } from '../../../scripts/adapter-conformance'
import { listenConformanceServer } from '../../../scripts/conformance-http'
import { koaAdapter } from '../src'

adapterConformance({
  name: 'Koa',
  formData: true,
  cancellation: true,
  malformedJson: true,
  open: (implementation) => {
    const app = new Koa()
    app.silent = true
    app.use(koaAdapter().mount(implementation))
    return listenConformanceServer(createServer(app.callback()))
  },
})
