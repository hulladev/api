import { defineServer } from '@hulla/api/server'
import { contract } from './contract'

export const implementation = defineServer(contract).implement({
  health: () => {
    if (process.env['HULLA_FIXTURE_DATABASE_FAIL']) throw new Error('HULLA_PRIVATE_DATABASE_IMPLEMENTATION')
    return { status: 200, body: 'ok' }
  },
})
