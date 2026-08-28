import { getRequestEvent } from '$app/server'
import type { Contract } from '@hulla/api'
import type { ClientTransport } from '@hulla/api/client'
import type { ServerExecutableFor } from '@hulla/api/server'
import { createSvelteKitRemoteTransport } from './remote-runtime'
import type { SvelteKitAdapterContext } from './server'

/**
 * Creates a zero-network client transport for use inside SvelteKit remote-function callbacks.
 *
 * An implementation whose context is bound with `svelteKitAdapter().context(...)` receives the current native
 * `RequestEvent`. Context-free implementations do not access request state and can also run during prerendering.
 */
export function svelteKitRemoteTransport<const ContractType extends Contract, const Context extends object>(
  implementation: ServerExecutableFor<ContractType, Context, 'sveltekit', SvelteKitAdapterContext>
): ClientTransport {
  return createSvelteKitRemoteTransport(implementation, getRequestEvent)
}

export type { SvelteKitAdapterContext, SvelteKitRequestEvent } from './server'
