import { createClient } from '@hulla/api/client'
import { inProcessTransport } from '@hulla/api/in-process'
import { contract } from '../../api/contract'
import { implementation } from './api'

export const api = createClient(contract, { transport: inProcessTransport(implementation) })
