import { defineContract, response, route } from '@hulla/api'

export const contract = defineContract({
  basePath: '/api',
  routes: {
    health: route.get('/health', {
      responses: { 200: response.text() },
    }),
  },
})
