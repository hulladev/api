import { solidStartAdapter } from '@hulla/api-solid-start'
import { implementation } from '../../api/server'

const handler = solidStartAdapter().mount(implementation)

export { handler as GET }
