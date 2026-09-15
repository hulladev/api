import { defineContract, response, route } from '@hulla/api'
import { z } from 'zod'

export const contract = defineContract({
  basePath: '/api',
  routes: {
    health: route.get('/health', {
      responses: {
        200: response.json(
          z.object({
            actor: z.string(),
            requestPath: z.string(),
            routePath: z.string(),
          })
        ),
      },
    }),
  },
})
