import { createServer } from 'node:http'
import express from 'express'
import { adapterConformance } from '../../../scripts/adapter-conformance'
import { listenConformanceServer } from '../../../scripts/conformance-http'
import { expressAdapter } from '../src'

adapterConformance({
  name: 'Express',
  formData: 'Multipart parsing belongs to application middleware',
  cancellation: true,
  malformedJson: true,
  open(implementation) {
    const app = express()
    app.use(express.json(), express.text(), express.raw({ type: 'application/octet-stream' }))
    expressAdapter(app).mount(implementation)
    return listenConformanceServer(createServer(app))
  },
})
