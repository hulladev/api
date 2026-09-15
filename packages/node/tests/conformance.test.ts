import { createServer } from 'node:http'
import { adapterConformance } from '../../../scripts/adapter-conformance'
import { listenConformanceServer } from '../../../scripts/conformance-http'
import { nodeHttpAdapter } from '../src/http'

adapterConformance({
  name: 'Node HTTP',
  formData: true,
  cancellation: true,
  malformedJson: true,
  open: (implementation) => listenConformanceServer(createServer(nodeHttpAdapter().mount(implementation))),
})
