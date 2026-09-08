import { defineContract, response, route } from '@hulla/api'

export const contract = defineContract({
  basePath: '/api',
  routes: {
    viewer: route.get('/viewer', { responses: { 200: response.text() } }),
    health: route.get('/health', {
      responses: { 200: response.text() },
    }),
  },
})
