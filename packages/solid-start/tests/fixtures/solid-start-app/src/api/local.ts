import { createClient } from '@hulla/api/client'
import { inProcessTransport } from '@hulla/api/in-process'
import { contract } from './contract'
import { implementation } from './server'

export const api = createClient(contract, { transport: inProcessTransport(implementation) })
