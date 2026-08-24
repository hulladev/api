import { defineContract, response, route } from '@hulla/api'
import { defineServer } from '@hulla/api/server'
import { z } from 'zod'

const output = z.object({ ok: z.boolean() })
const contract = defineContract({
  routes: { health: route.get('/health', { responses: { 200: response.json(output) } }) },
})

export const server = defineServer(contract).implement({
  health: () => ({ status: 200, body: { ok: true } }),
})
