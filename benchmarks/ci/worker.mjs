import assert from 'node:assert/strict'
import { readFile } from 'node:fs/promises'
import { createRequire } from 'node:module'
import { resolve } from 'node:path'
import { pathToFileURL } from 'node:url'

const root = resolve(process.argv[2])
const require = createRequire(resolve(root, 'package.json'))
const { z } = await import(pathToFileURL(require.resolve('zod')).href)
const load = (file) => import(pathToFileURL(resolve(root, 'packages/core/dist', file)).href)
const { defineContract, request, response, route } = await load('index.js')
const { createClient } = await load('client/index.js')
const { fetchAdapter, fetchTransport } = await load('fetch/index.js')
const { defineServer } = await load('server/index.js')
const user = z.object({ id: z.string(), name: z.string() })
const contract = defineContract({
  routes: {
    read: route.get('/users/:id', {
      params: z.object({ id: z.string() }),
      responses: { 200: response.json(user) },
    }),
    create: route.post('/users', {
      body: request.json(z.object({ name: z.string() })),
      responses: { 201: response.json(user) },
    }),
  },
})
const handler = fetchAdapter().mount(
  defineServer(contract).implement({
    read: ({ params }) => ({ status: 200, body: { id: params.id, name: 'Ada' } }),
    create: ({ body }) => ({ status: 201, body: { id: '42', name: body.name } }),
  })
)
const client = createClient(contract, {
  transport: fetchTransport({ baseUrl: 'https://benchmark.local', fetch: handler }),
})
const scenarios = [
  { name: 'parameterized-json-get', run: () => client.read({ params: { id: '42' } }), status: 200 },
  { name: 'small-json-post', run: () => client.create({ body: { name: 'Ada' } }), status: 201 },
]
// Validate actual responses outside timing. Each timed call still performs the
// package's normal validation, encoding, Fetch dispatch, and response decoding.
for (const scenario of scenarios) {
  const result = await scenario.run()
  assert.equal(result.status, scenario.status)
  assert.deepEqual(result.body, { id: '42', name: 'Ada' })
}
const sampleMs = Number(process.env.BENCH_CI_SAMPLE_MS ?? 150)
const count = Number(process.env.BENCH_CI_SAMPLES ?? 7)
assert.ok(Number.isFinite(sampleMs) && sampleMs > 0)
assert.ok(Number.isSafeInteger(count) && count > 0)
const results = []
for (const scenario of scenarios) {
  for (let i = 0; i < 300; i++) await scenario.run()
  const samples = []
  for (let sample = 0; sample < count; sample++) {
    let operations = 0
    const start = performance.now()
    let elapsed
    do {
      for (let i = 0; i < 50; i++) await scenario.run()
      operations += 50
      elapsed = performance.now() - start
    } while (elapsed < sampleMs)
    samples.push({ microseconds: (elapsed * 1000) / operations, operations, elapsedMs: elapsed })
  }
  results.push({ name: scenario.name, samples })
}
const { version } = JSON.parse(await readFile(resolve(root, 'packages/core/package.json'), 'utf8'))
console.log(JSON.stringify({ version, results }))
