import { createAdapterHandler } from '../adapters/runtime'
import type { ClientTransport, ClientTransportRequest, ClientTransportResponse } from '../client/request'
import type { Contract } from '../contract'
import {
  assertAdapterContext,
  createServerAdapter,
  serverContextAdapterId,
  type ServerAdapter,
  type ServerContextInput,
} from '../server/context'
import type { ServerExecutableFor } from '../server/types'

export type InProcessContextInput<ContractType extends Contract = Contract> = ServerContextInput<ContractType> & {
  readonly request: ClientTransportRequest
}

export type InProcessAdapter = ServerAdapter<'in-process', { readonly request: ClientTransportRequest }> & {
  readonly mount: typeof inProcessTransport
}

/**
 * Creates a transport for clients and servers that share one JavaScript process.
 * It crosses the same encoded client/server boundary without constructing Fetch objects.
 */
export function inProcessTransport<const ContractType extends Contract, const Context extends object>(
  implementation: ServerExecutableFor<ContractType, Context, 'in-process'>
): ClientTransport {
  assertAdapterContext(implementation.context, 'in-process')
  const usesNativeContext = serverContextAdapterId(implementation.context) !== undefined
  const dispatch = createAdapterHandler(implementation)

  return async (request): Promise<ClientTransportResponse> => {
    request.signal?.throwIfAborted()
    const response = await dispatch({
      request,
      ...(usesNativeContext ? { contextInput: { request } } : {}),
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
          throw new TypeError(`In-process response body is ${response.body.kind}, but the client selected ${kind}`)
        }
        return response.body.value
      },
    }
  }
}

let inProcessAdapterValue: InProcessAdapter | undefined

/** Creates an in-process server adapter with native context and mounting operations. */
export function inProcessAdapter(): InProcessAdapter {
  return (inProcessAdapterValue ??= createServerAdapter('in-process', {
    mount: inProcessTransport,
  }) as unknown as InProcessAdapter)
}
