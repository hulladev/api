import { defineContract, response, route } from '@hulla/api'
import { z } from 'zod'

const output = z.object({ ok: z.boolean() })

export const contract = defineContract({
  routes: { health: route.get('/health', { responses: { 200: response.json(output) } }) },
})
