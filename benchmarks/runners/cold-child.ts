const imported = performance.now()
const { defineContract, response, route } = await import('@hulla/api')
const { defineClient } = await import('@hulla/api/client')
const { defineServer } = await import('@hulla/api/server')
const { fetchAdapter, fetchTransport } = await import('@hulla/api/fetch')
const importsMs = performance.now() - imported
const construction = performance.now()
const contract = defineContract({ routes: { health: route.get('/', { responses: { 200: response.json() } }) } })
const server = defineServer(contract).implement({ health: () => ({ status: 200, body: { ok: true } }) })
const client = defineClient(contract, {
  transport: fetchTransport({ baseUrl: 'http://bench', fetch: fetchAdapter().mount(server) }),
})
const constructionMs = performance.now() - construction
const first = performance.now()
const result = await client.health()
if (result.status !== 200 || !(result.body as { ok: boolean }).ok) throw new Error('Invalid cold response')
console.log(
  JSON.stringify({
    importsMs,
    constructionMs,
    firstCallMs: performance.now() - first,
    processId: process.pid,
    rssBytes: process.memoryUsage().rss,
  })
)
export {}
