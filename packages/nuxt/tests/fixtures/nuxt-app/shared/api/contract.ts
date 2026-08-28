import { defineContract, response, route } from '@hulla/api'
import { z } from 'zod'

export const renameInput = z.object({ name: z.string() })

export const contract = defineContract({
  basePath: '/api',
  routes: {
    health: route.get('/health', {
      responses: { 200: response.json(z.object({ actor: z.string(), ok: z.literal(true) })) },
    }),
    rename: route.post('/rename', {
      body: renameInput,
      responses: { 200: response.json(z.object({ name: z.string() })) },
    }),
  },
})
