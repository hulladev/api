import { defineServer } from '@hulla/api/server'
import { contract } from './contract'

export const implementation = defineServer(contract).implement({
  health: () => ({ status: 200, body: 'ok' }),
  rename: ({ body }) => ({ status: 200, body }),
})
