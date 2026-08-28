import { defineContract, response, route } from '@hulla/api'
import { defineClient } from '@hulla/api/client'
import { fetchAdapter, fetchTransport } from '@hulla/api/fetch'
import { defineServer } from '@hulla/api/server'
import { z } from 'zod'

const output = z.object({ ok: z.boolean() })
const contract = defineContract({
  routes: { health: route.get('/health', { responses: { 200: response.json(output) } }) },
})
const server = defineServer(contract)
const handler = fetchAdapter().mount(server.implement({ health: () => ({ status: 200, body: { ok: true } }) }))

export const client = defineClient(contract, {
  transport: fetchTransport({ baseUrl: 'https://size.local', fetch: handler }),
}).create()
