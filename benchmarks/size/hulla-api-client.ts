import { defineContract, response, route } from '@hulla/api'
import { createClient, type ClientTransport } from '@hulla/api/client'
import { z } from 'zod'

const output = z.object({ ok: z.boolean() })
const contract = defineContract({
  routes: { health: route.get('/health', { responses: { 200: response.json(output) } }) },
})
const transport: ClientTransport = () => {
  throw new Error('Size fixture transport')
}

export const client = createClient(contract, { transport })
