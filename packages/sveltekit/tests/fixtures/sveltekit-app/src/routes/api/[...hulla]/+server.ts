import { svelteKitAdapter } from '@hulla/api-sveltekit/server'
import { implementation } from '../../../api/server'

const handler = svelteKitAdapter().mount(implementation)

export { handler as GET }
