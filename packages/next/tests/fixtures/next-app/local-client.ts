import 'server-only'
import { defineClient } from '@hulla/api/client'
import { inProcessTransport } from '@hulla/api/in-process'
import { contract } from './contract'
import { implementation } from './server'

export const api = defineClient(contract, {
  transport: inProcessTransport(implementation),
})
