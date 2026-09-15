import type { Contract } from '@hulla/api'
import { createAdapterRuntime } from '@hulla/api/adapters'
import { createFetchHandler, type FetchServerErrorInput } from '@hulla/api/fetch'
import {
  createServerAdapter,
  type Awaitable,
  type ServerAdapter,
  type ServerContextInput,
  type ServerExecutableFor,
} from '@hulla/api/server'
import type { RequestEvent as NativeSvelteKitRequestEvent } from '@sveltejs/kit'

export type SvelteKitRequestEvent = NativeSvelteKitRequestEvent

export type SvelteKitRouteHandler = (event: SvelteKitRequestEvent) => Promise<Response>

export type SvelteKitAdapterContext = {
  readonly request: Request
  readonly svelteKitEvent: SvelteKitRequestEvent
}

export type SvelteKitServerErrorInput = Omit<FetchServerErrorInput<SvelteKitRequestEvent>, 'handlerContext'> & {
  readonly svelteKitEvent: SvelteKitRequestEvent
}

export type SvelteKitServerOptions = {
  readonly onError?: ((input: SvelteKitServerErrorInput) => Awaitable<Response | undefined | void>) | undefined
}

export type SvelteKitContextInput<ContractType extends Contract = Contract> = ServerContextInput<ContractType> &
  SvelteKitAdapterContext

export type SvelteKitAdapter = ServerAdapter<'sveltekit', SvelteKitAdapterContext> & {
  readonly mount: <const ContractType extends Contract, const Context extends object>(
    implementation: ServerExecutableFor<ContractType, Context, 'sveltekit', SvelteKitAdapterContext>,
    options?: SvelteKitServerOptions
  ) => SvelteKitRouteHandler
}

/** Creates a SvelteKit endpoint handler backed by an @hulla/api server implementation. */
function createRouteHandler<const ContractType extends Contract, const Context extends object>(
  implementation: ServerExecutableFor<ContractType, Context, 'sveltekit', SvelteKitAdapterContext>,
  options: SvelteKitServerOptions = {}
): SvelteKitRouteHandler {
  const unsupported = createAdapterRuntime(implementation).routes.filter((route) => route.method === 'QUERY')
  if (unsupported.length > 0) {
    throw new TypeError(
      `SvelteKit endpoints do not support QUERY routes: ${unsupported.map((route) => route.key.join('.')).join(', ')}`
    )
  }

  const handler = createFetchHandler<ContractType, Context, SvelteKitRequestEvent, 'sveltekit'>(implementation, {
    contextAdapter: 'sveltekit',
    contextInput: (_request, svelteKitEvent) => ({ svelteKitEvent }),
    ...(options.onError === undefined
      ? {}
      : {
          onError: ({ handlerContext, ...input }: FetchServerErrorInput<SvelteKitRequestEvent>) =>
            options.onError?.({ ...input, svelteKitEvent: handlerContext }),
        }),
  })

  return async (event) => {
    if (event.request.method !== 'HEAD') return handler(event.request, event)

    const response = await handler(new Request(event.request, { method: 'GET' }), event)
    return new Response(null, response)
  }
}

let svelteKitAdapterValue: SvelteKitAdapter | undefined

function createSvelteKitAdapter(defaults: SvelteKitServerOptions): SvelteKitAdapter {
  return createServerAdapter('sveltekit', {
    mount: <const ContractType extends Contract, const Context extends object>(
      implementation: ServerExecutableFor<ContractType, Context, 'sveltekit', SvelteKitAdapterContext>,
      options?: SvelteKitServerOptions
    ) => createRouteHandler(implementation, options === undefined ? defaults : { ...defaults, ...options }),
  }) as unknown as SvelteKitAdapter
}

/** Creates a SvelteKit adapter with native request-event context and mounting operations. */
export function svelteKitAdapter(options?: SvelteKitServerOptions): SvelteKitAdapter {
  if (options !== undefined) return createSvelteKitAdapter({ ...options })
  svelteKitAdapterValue ??= createSvelteKitAdapter({})
  return svelteKitAdapterValue
}
