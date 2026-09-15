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
import { toWebRequest, type H3Event as NativeNuxtRequestEvent } from 'h3'

export type NuxtRequestEvent = NativeNuxtRequestEvent

export type NuxtRouteHandler = (event: NuxtRequestEvent) => Promise<Response>

export type NuxtAdapterContext = {
  readonly request: Request
  readonly nuxtEvent: NuxtRequestEvent
}

export type NuxtServerErrorInput = Omit<FetchServerErrorInput<NuxtRequestEvent>, 'handlerContext'> & {
  readonly nuxtEvent: NuxtRequestEvent
}

export type NuxtServerOptions = {
  readonly onError?: ((input: NuxtServerErrorInput) => Awaitable<Response | undefined | void>) | undefined
}

export type NuxtContextInput<ContractType extends Contract = Contract> = ServerContextInput<ContractType> &
  NuxtAdapterContext

export type NuxtAdapter = ServerAdapter<'nuxt', NuxtAdapterContext> & {
  readonly mount: <const ContractType extends Contract, const Context extends object>(
    implementation: ServerExecutableFor<ContractType, Context, 'nuxt', NuxtAdapterContext>,
    options?: NuxtServerOptions
  ) => NuxtRouteHandler
}

/** Creates a Nitro event handler backed by an @hulla/api server implementation. */
function createRouteHandler<const ContractType extends Contract, const Context extends object>(
  implementation: ServerExecutableFor<ContractType, Context, 'nuxt', NuxtAdapterContext>,
  options: NuxtServerOptions = {}
): NuxtRouteHandler {
  const unsupported = createAdapterRuntime(implementation).routes.filter((route) => route.method === 'QUERY')
  if (unsupported.length > 0) {
    throw new TypeError(
      `Nuxt server routes do not support QUERY routes: ${unsupported.map((route) => route.key.join('.')).join(', ')}`
    )
  }

  const handler = createFetchHandler<ContractType, Context, NuxtRequestEvent, 'nuxt'>(implementation, {
    contextAdapter: 'nuxt',
    contextInput: (_request, nuxtEvent) => ({ nuxtEvent }),
    ...(options.onError === undefined
      ? {}
      : {
          onError: ({ handlerContext, ...input }: FetchServerErrorInput<NuxtRequestEvent>) =>
            options.onError?.({ ...input, nuxtEvent: handlerContext }),
        }),
  })

  return async (nuxtEvent) => {
    const request = toWebRequest(nuxtEvent)
    if (request.method !== 'HEAD') return handler(request, nuxtEvent)

    const response = await handler(new Request(request, { method: 'GET' }), nuxtEvent)
    return new Response(null, response)
  }
}

let nuxtAdapterValue: NuxtAdapter | undefined

function createNuxtAdapter(defaults: NuxtServerOptions): NuxtAdapter {
  return createServerAdapter('nuxt', {
    mount: <const ContractType extends Contract, const Context extends object>(
      implementation: ServerExecutableFor<ContractType, Context, 'nuxt', NuxtAdapterContext>,
      options?: NuxtServerOptions
    ) => createRouteHandler(implementation, options === undefined ? defaults : { ...defaults, ...options }),
  }) as unknown as NuxtAdapter
}

/** Creates a Nuxt adapter with native Nitro request-event context and mounting operations. */
export function nuxtAdapter(options?: NuxtServerOptions): NuxtAdapter {
  if (options !== undefined) return createNuxtAdapter({ ...options })
  nuxtAdapterValue ??= createNuxtAdapter({})
  return nuxtAdapterValue
}
