import { defineServer } from '@hulla/api/server'
import { contract } from '../../api/contract'

export const implementation = defineServer(contract).implement({
  health: () => {
    if (process.env['HULLA_FIXTURE_DATABASE_FAIL']) throw new Error('HULLA_SVELTEKIT_PRIVATE_DATABASE')
    return { status: 200, body: 'ok' }
  },
  rename: ({ body }) => ({ status: 200, body }),
})
