import { nextAdapter } from '@hulla/api-next/server'
import { defineServer } from '@hulla/api/server'
import { contract } from './contract'

export const implementation = defineServer(contract, {
  adapter: nextAdapter(),
  context: async ({ request, routeContext }) => ({
    params: await routeContext.params,
    pathname: request.nextUrl.pathname,
  }),
}).implement({
  health: ({ context }) => ({
    status: 200,
    body: context.pathname === '/api/health' ? 'ok' : 'unexpected',
  }),
})
