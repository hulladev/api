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
import type { APIEvent as NativeSolidStartAPIEvent } from '@solidjs/start/server'

export type SolidStartAPIEvent = NativeSolidStartAPIEvent

export type SolidStartRouteHandler = (event: SolidStartAPIEvent) => Promise<Response>

type SolidStartAdapterContext = {
  readonly request: Request
  readonly solidStartEvent: SolidStartAPIEvent
}

export type SolidStartServerErrorInput = Omit<FetchServerErrorInput<SolidStartAPIEvent>, 'handlerContext'> & {
  readonly solidStartEvent: SolidStartAPIEvent
}

export type SolidStartServerOptions = {
  readonly onError?: ((input: SolidStartServerErrorInput) => Awaitable<Response | undefined | void>) | undefined
}

export type SolidStartContextInput<ContractType extends Contract = Contract> = ServerContextInput<ContractType> &
  SolidStartAdapterContext

export type SolidStartAdapter = ServerAdapter<'solid-start', SolidStartAdapterContext> & {
  readonly mount: <const ContractType extends Contract, const Context extends object>(
    implementation: ServerExecutableFor<ContractType, Context, 'solid-start', SolidStartAdapterContext>,
    options?: SolidStartServerOptions
  ) => SolidStartRouteHandler
}

/** Creates a SolidStart API route handler backed by an @hulla/api server implementation. */
function createRouteHandler<const ContractType extends Contract, const Context extends object>(
  implementation: ServerExecutableFor<ContractType, Context, 'solid-start', SolidStartAdapterContext>,
  options: SolidStartServerOptions = {}
): SolidStartRouteHandler {
  const unsupported = createAdapterRuntime(implementation).routes.filter((route) => route.method === 'QUERY')
  if (unsupported.length > 0) {
    throw new TypeError(
      `SolidStart API routes do not support QUERY routes: ${unsupported.map((route) => route.key.join('.')).join(', ')}`
    )
  }

  const handler = createFetchHandler<ContractType, Context, SolidStartAPIEvent, 'solid-start'>(implementation, {
    contextAdapter: 'solid-start',
    contextInput: (_request, solidStartEvent) => ({ solidStartEvent }),
    ...(options.onError === undefined
      ? {}
      : {
          onError: ({ handlerContext, ...input }: FetchServerErrorInput<SolidStartAPIEvent>) =>
            options.onError?.({ ...input, solidStartEvent: handlerContext }),
        }),
  })

  return async (event) => {
    if (event.request.method !== 'HEAD') return handler(event.request, event)

    const response = await handler(new Request(event.request, { method: 'GET' }), event)
    return new Response(null, response)
  }
}

let solidStartAdapterValue: SolidStartAdapter | undefined

function createSolidStartAdapter(defaults: SolidStartServerOptions): SolidStartAdapter {
  return createServerAdapter('solid-start', {
    mount: <const ContractType extends Contract, const Context extends object>(
      implementation: ServerExecutableFor<ContractType, Context, 'solid-start', SolidStartAdapterContext>,
      options?: SolidStartServerOptions
    ) => createRouteHandler(implementation, options === undefined ? defaults : { ...defaults, ...options }),
  }) as unknown as SolidStartAdapter
}

/** Creates a SolidStart adapter with native API-event context and mounting operations. */
export function solidStartAdapter(options?: SolidStartServerOptions): SolidStartAdapter {
  if (options !== undefined) return createSolidStartAdapter({ ...options })
  solidStartAdapterValue ??= createSolidStartAdapter({})
  return solidStartAdapterValue
}
