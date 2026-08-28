import { adapter, implementation } from '../../../server'

const handler = adapter.mount(implementation)

export { handler as GET }
