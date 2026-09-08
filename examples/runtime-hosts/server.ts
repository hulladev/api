import { defineContract, request, response, route } from '@hulla/api'
import { fetchAdapter } from '@hulla/api/fetch'
import { defineServer } from '@hulla/api/server'

export const contract = defineContract({
  routes: {
    health: route.get('/api/health', { responses: { 200: response.json() } }),
    echo: route.post('/api/echo', { body: request.bytes(), responses: { 201: response.bytes() } }),
    stream: route.get('/api/stream', { responses: { 200: response.stream() } }),
  },
})
const adapter = fetchAdapter()
const implementation = defineServer(contract, {
  context: adapter.context(({ request }) => ({ actor: request.headers.get('x-actor') ?? 'anonymous' })),
}).implement({
  health: ({ context }) => ({ status: 200, body: { ok: true, actor: context.actor } }),
  echo: ({ body }) => ({ status: 201, body, headers: { 'set-cookie': ['first=1; Path=/', 'second=2; Path=/'] } }),
  stream: () => ({
    status: 200,
    body: (async function* () {
      yield new Uint8Array([0, 128])
      yield new Uint8Array([255])
    })(),
  }),
})
export const handler = adapter.mount(implementation)
