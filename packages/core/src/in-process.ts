import { createAdapterHandler } from './adapters/runtime'
import type { ClientTransport, ClientTransportRequest, ClientTransportResponse } from './client/request'
import type { Contract } from './contract'
import { assertServerAdapter, createServerAdapter, type ServerAdapter } from './server/adapter'
import type { ServerExecutableFor } from './server/types'

export type InProcessAdapter = ServerAdapter<'in-process', { readonly request: ClientTransportRequest }>

const inProcessAdapterDescriptor = /* @__PURE__ */ createServerAdapter('in-process') as InProcessAdapter

export function inProcessAdapter(): InProcessAdapter {
  return inProcessAdapterDescriptor
}

/**
 * Creates a transport for clients and servers that share one JavaScript process.
 * It crosses the same encoded client/server boundary without constructing Fetch objects.
 */
export function inProcessTransport<const ContractType extends Contract, const Context extends object>(
  implementation: ServerExecutableFor<ContractType, Context, InProcessAdapter>
): ClientTransport {
  assertServerAdapter(implementation.adapter, inProcessAdapterDescriptor)
  const dispatch = createAdapterHandler(implementation)

  return async (request): Promise<ClientTransportResponse> => {
    request.signal?.throwIfAborted()
    const response = await dispatch({
      request,
      contextInput: { request },
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
