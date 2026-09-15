import 'server-only'
import { nextAdapter } from '@hulla/api-next/server'
import { defineServer } from '@hulla/api/server'
import { cookies } from 'next/headers'
import { contract } from './contract'
import { health, userForSession } from './database'

export const adapter = nextAdapter()

// Lazy request access keeps public reads usable during prerendering.
// The factory runs for each call; no user's identity is stored globally.
export const implementation = defineServer(contract, {
  context: () => ({
    user: async () => userForSession((await cookies()).get('session')?.value),
  }),
}).implement({
  health: () => ({ status: 200, body: health() }),
  viewer: async ({ context }) => ({ status: 200, body: await context.user() }),
})
