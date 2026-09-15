import type { Contract } from '@hulla/api'
import { createAdapterHandler, type AdapterResponse } from '@hulla/api/adapters'
import type { ClientTransport, ClientTransportResponse } from '@hulla/api/client'
import { createFetchHandler, type FetchServerErrorInput } from '@hulla/api/fetch'
import {
  assertAdapterContext,
  createServerAdapter,
  serverContextAdapterId,
  type Awaitable,
  type ServerAdapter,
  type ServerContextInput,
  type ServerExecutableFor,
} from '@hulla/api/server'
import type { APIContext as NativeAstroContext, APIRoute } from 'astro'

export type AstroContext = NativeAstroContext
export type AstroRouteHandler = APIRoute

export type AstroAdapterContext = {
  readonly request: Request
  readonly astroContext: AstroContext
}

export type AstroServerErrorInput = Omit<FetchServerErrorInput<AstroContext>, 'handlerContext'> & {
  readonly astroContext: AstroContext
}

export type AstroServerOptions = {
  readonly onError?: ((input: AstroServerErrorInput) => Awaitable<Response | undefined | void>) | undefined
}

export type AstroContextInput<ContractType extends Contract = Contract> = ServerContextInput<ContractType> &
  AstroAdapterContext

export type AstroAdapter = ServerAdapter<'astro', AstroAdapterContext> & {
  readonly mount: <const ContractType extends Contract, const Context extends object>(
    implementation: ServerExecutableFor<ContractType, Context, 'astro', AstroAdapterContext>,
    options?: AstroServerOptions
  ) => AstroRouteHandler
}

/** Creates an Astro API route backed by an @hulla/api server implementation. */
function createRouteHandler<const ContractType extends Contract, const Context extends object>(
  implementation: ServerExecutableFor<ContractType, Context, 'astro', AstroAdapterContext>,
  options: AstroServerOptions = {}
): AstroRouteHandler {
  const handler = createFetchHandler<ContractType, Context, AstroContext, 'astro'>(implementation, {
    contextAdapter: 'astro',
    contextInput: (_request, astroContext) => ({ astroContext }),
    ...(options.onError === undefined
      ? {}
      : {
          onError: ({ handlerContext, ...input }: FetchServerErrorInput<AstroContext>) =>
            options.onError?.({ ...input, astroContext: handlerContext }),
        }),
  })

  return async (astroContext) => {
    const request = astroContext.request
    if (request.method !== 'HEAD') return handler(request, astroContext)

    const response = await handler(new Request(request, { method: 'GET' }), astroContext)
    return new Response(null, response)
  }
}

function inProcessResponse(response: AdapterResponse): ClientTransportResponse {
  return {
    status: response.status,
    headers: response.headers,
    native: response,
    readBody: (kind) => {
      if (response.body.kind !== kind) {
        throw new TypeError(`Astro in-process response body is ${response.body.kind}, but the client selected ${kind}`)
      }
      return response.body.value
    },
  }
}

/**
 * Creates a zero-network client transport for an Astro page, endpoint, or server island.
 *
 * The explicit context is the current Astro render context. Inside a server island its request URL identifies Astro's
 * internal island endpoint rather than the page that contains the island.
 */
export function astroInProcessTransport<const ContractType extends Contract, const Context extends object>(
  implementation: ServerExecutableFor<ContractType, Context, 'astro', AstroAdapterContext>,
  astroContext: AstroContext
): ClientTransport {
  assertAdapterContext(implementation.context, 'astro')
  const usesAstroContext = serverContextAdapterId(implementation.context) === 'astro'
  const dispatch = createAdapterHandler(implementation)

  return async (request) => {
    request.signal?.throwIfAborted()
    const response = await dispatch({
      request: astroContext.request,
      ...(usesAstroContext
        ? {
            contextInput: {
              request: astroContext.request,
              astroContext,
            },
          }
        : {}),
      method: request.method,
      pathname: request.path,
      headers: request.headers,
      ...(request.query === undefined ? {} : { query: request.query }),
      ...(request.body === undefined
        ? {}
        : { body: { value: request.body.value, contentType: request.body.contentType } }),
    })
    return inProcessResponse(response)
  }
}

let astroAdapterValue: AstroAdapter | undefined

function createAstroAdapter(defaults: AstroServerOptions): AstroAdapter {
  return createServerAdapter('astro', {
    mount: <const ContractType extends Contract, const Context extends object>(
      implementation: ServerExecutableFor<ContractType, Context, 'astro', AstroAdapterContext>,
      options?: AstroServerOptions
    ) => createRouteHandler(implementation, options === undefined ? defaults : { ...defaults, ...options }),
  }) as unknown as AstroAdapter
}

/** Creates an Astro adapter with native render-context access and endpoint mounting operations. */
export function astroAdapter(options?: AstroServerOptions): AstroAdapter {
  if (options !== undefined) return createAstroAdapter({ ...options })
  astroAdapterValue ??= createAstroAdapter({})
  return astroAdapterValue
}
