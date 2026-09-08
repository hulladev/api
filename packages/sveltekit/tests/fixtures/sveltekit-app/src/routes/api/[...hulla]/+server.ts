import { implementation } from '$lib/server/api'
import { svelteKitAdapter } from '@hulla/api-sveltekit/server'

const handler = svelteKitAdapter().mount(implementation)

export { handler as GET }
