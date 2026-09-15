import type { Contract } from '@hulla/api'
import { createAdapterHandler } from '@hulla/api/adapters'
import type { ClientTransport, ClientTransportResponse, ClientTransportRequest } from '@hulla/api/client'
import { assertAdapterContext, serverContextAdapterId, type ServerExecutableFor } from '@hulla/api/server'
import type { SvelteKitAdapterContext, SvelteKitRequestEvent } from './server'

export type SvelteKitRequestEventProvider = () => SvelteKitRequestEvent

/** Internal provider-injected implementation shared by the public SvelteKit remote entrypoint and unit tests. */
export function createSvelteKitRemoteTransport<const ContractType extends Contract, const Context extends object>(
  implementation: ServerExecutableFor<ContractType, Context, 'sveltekit', SvelteKitAdapterContext>,
  getRequestEvent: SvelteKitRequestEventProvider
): ClientTransport {
  assertAdapterContext(implementation.context, 'sveltekit')
  const usesSvelteKitContext = serverContextAdapterId(implementation.context) === 'sveltekit'
  const dispatch = createAdapterHandler(implementation)

  return async (request: ClientTransportRequest): Promise<ClientTransportResponse> => {
    request.signal?.throwIfAborted()
    const svelteKitEvent = usesSvelteKitContext ? getRequestEvent() : undefined
    const response = await dispatch({
      request,
      ...(svelteKitEvent === undefined
        ? {}
        : {
            contextInput: {
              request: svelteKitEvent.request,
              svelteKitEvent,
            },
          }),
      method: request.method,
      pathname: request.path,
      headers: request.headers,
      ...(request.query === undefined ? {} : { query: request.query }),
      ...(request.body === undefined
        ? {}
        : { body: { value: request.body.value, contentType: request.body.contentType } }),
    })

    return {
      status: response.status,
      headers: response.headers,
      native: response,
      readBody: (kind) => {
        if (response.body.kind !== kind) {
          throw new TypeError(
            `SvelteKit remote response body is ${response.body.kind}, but the client selected ${kind}`
          )
        }
        return response.body.value
      },
    }
  }
}
