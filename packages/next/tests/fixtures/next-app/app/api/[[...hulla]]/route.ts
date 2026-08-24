import { createRouteHandler } from '@hulla/api-next/server'
import { implementation } from '../../../server'

const handler = createRouteHandler(implementation)

export { handler as GET }
