import { nuxtAdapter } from '@hulla/api-nuxt/server'
import { defineServer } from '@hulla/api/server'
import { contract } from '~~/shared/api/contract'

const adapter = nuxtAdapter()

export const implementation = defineServer(contract, {
  context: adapter.context(({ nuxtEvent }) => ({
    actor: String(nuxtEvent.context['actor'] ?? 'anonymous'),
  })),
}).implement({
  health: ({ context }) => ({ status: 200, body: { actor: context.actor, ok: true } }),
  rename: ({ body }) => ({ status: 200, body }),
})
