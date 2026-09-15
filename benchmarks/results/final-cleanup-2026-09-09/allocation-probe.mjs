import { writeFileSync } from 'node:fs'
import { Session } from 'node:inspector'
import { z } from '/Users/samuel/Coding/hulla/api/node_modules/zod/index.js'
import { createClient } from '/Users/samuel/Coding/hulla/api/packages/core/dist/client/index.js'
import { fetchAdapter, fetchTransport } from '/Users/samuel/Coding/hulla/api/packages/core/dist/fetch/index.js'
import { defineContract, route, response } from '/Users/samuel/Coding/hulla/api/packages/core/dist/index.js'
import { defineServer } from '/Users/samuel/Coding/hulla/api/packages/core/dist/server/index.js'
const contract = defineContract({
  routes: {
    update: route.post('/items/:id', {
      params: z.object({ id: z.string() }),
      query: z.object({ page: z.string() }),
      headers: z.object({ 'x-token': z.string() }),
      body: z.object({ count: z.number() }),
      responses: { 200: response.json(z.object({ count: z.number() })) },
    }),
  },
})
const implementation = defineServer(contract).implement({ update: ({ body }) => ({ status: 200, body }) })
const client = createClient(contract, {
  transport: fetchTransport({ baseUrl: 'https://alloc.test', fetch: fetchAdapter().mount(implementation) }),
})
const input = { params: { id: 'one' }, query: { page: '2' }, headers: { 'x-token': 'token' }, body: { count: 2 } }
for (let i = 0; i < 3000; i++) await client.update(input)
const session = new Session()
session.connect()
const post = (method, params = {}) =>
  new Promise((resolve, reject) =>
    session.post(method, params, (error, result) => (error ? reject(error) : resolve(result)))
  )
await post('HeapProfiler.startSampling', {
  samplingInterval: 32768,
  includeObjectsCollectedByMajorGC: true,
  includeObjectsCollectedByMinorGC: true,
})
const calls = 20000
for (let i = 0; i < calls; i++) await client.update(input)
const { profile } = await post('HeapProfiler.stopSampling')
session.disconnect()
const rows = []
function visit(node) {
  if (node.selfSize)
    rows.push({
      bytes: node.selfSize,
      function: node.callFrame.functionName,
      url: node.callFrame.url,
      line: node.callFrame.lineNumber + 1,
    })
  for (const child of node.children) visit(child)
}
visit(profile.head)
rows.sort((a, b) => b.bytes - a.bytes)
writeFileSync(
  '/tmp/final-allocation.json',
  JSON.stringify(
    {
      runtime: process.version,
      calls,
      samplingInterval: 32768,
      includesCollectedObjects: true,
      totalSampledBytes: rows.reduce((n, r) => n + r.bytes, 0),
      rows,
      profile,
    },
    null,
    2
  )
)
console.log(JSON.stringify(rows.slice(0, 12), null, 2))
