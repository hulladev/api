import { astroAdapter } from '@hulla/api-astro'
import { defineServer } from '@hulla/api/server'
import { contract } from './contract'

export const adapter = astroAdapter()

export const implementation = defineServer(contract, {
  context: adapter.context(({ astroContext, request, route }) => ({
    actor: astroContext.locals.actor,
    requestPath: new URL(request.url).pathname,
    routePath: route.path,
  })),
}).implement({
  health: ({ context }) => ({ status: 200, body: context }),
})
