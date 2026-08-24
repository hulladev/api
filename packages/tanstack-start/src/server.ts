import type { Contract } from '@hulla/api'
import { createAdapterRuntime } from '@hulla/api/adapters'
import { createFetchHandler, type FetchServerErrorInput } from '@hulla/api/fetch'
import {
  registerServerContextAdapter,
  type Awaitable,
  type ServerContextInput,
  type ServerExecutable,
} from '@hulla/api/server'

export type TanStackStartRouteParams = Readonly<Record<string, string | undefined>>

export type TanStackStartHandlerInput<
  StartContext = unknown,
  Params extends TanStackStartRouteParams = TanStackStartRouteParams,
> = {
  readonly context: StartContext
  readonly params: Params
  readonly request: Request
}

export type TanStackStartRouteHandler<
  StartContext = unknown,
  Params extends TanStackStartRouteParams = TanStackStartRouteParams,
> = (input: TanStackStartHandlerInput<StartContext, Params>) => Promise<Response>

export type TanStackStartServerErrorInput = FetchServerErrorInput

export type TanStackStartServerOptions = {
  readonly onError?: (input: TanStackStartServerErrorInput) => Awaitable<Response | undefined | void>
}

export type TanStackStartContextInput<
  ContractType extends Contract = Contract,
  StartContext = unknown,
  Params extends TanStackStartRouteParams = TanStackStartRouteParams,
> = ServerContextInput<ContractType> & {
  readonly request: Request
  readonly startContext: StartContext
  readonly startParams: Params
}

export type TanStackStartRouteMethod = 'DELETE' | 'GET' | 'PATCH' | 'POST' | 'PUT'

export type TanStackStartRouteHandlers<
  StartContext = unknown,
  Params extends TanStackStartRouteParams = TanStackStartRouteParams,
> = Readonly<Partial<Record<TanStackStartRouteMethod, TanStackStartRouteHandler<StartContext, Params>>>>

/** Gives a server context factory access to TanStack Start's native server-route input. */
export function withContext<const Context extends object>(
  factory: (input: TanStackStartContextInput) => Awaitable<Context>
): <ContractType extends Contract>(input: ServerContextInput<ContractType>) => Awaitable<Context>
export function withContext<
  StartContext = unknown,
  Params extends TanStackStartRouteParams = TanStackStartRouteParams,
>(): <const Context extends object>(
  factory: (input: TanStackStartContextInput<Contract, StartContext, Params>) => Awaitable<Context>
) => <ContractType extends Contract>(input: ServerContextInput<ContractType>) => Awaitable<Context>
export function withContext(factory?: (input: TanStackStartContextInput) => Awaitable<object>): unknown {
  if (factory === undefined) {
    return <const Context extends object>(configured: (input: TanStackStartContextInput) => Awaitable<Context>) =>
      registerServerContextAdapter('tanstack-start', (input: ServerContextInput) =>
        configured(input as unknown as TanStackStartContextInput)
      )
  }
  return registerServerContextAdapter('tanstack-start', (input: ServerContextInput) =>
    factory(input as unknown as TanStackStartContextInput)
  )
}

/** Creates the method-handler map mounted by a TanStack Start wildcard server route. */
export function createServerRouteHandlers<const ContractType extends Contract, const Context extends object>(
  implementation: ServerExecutable<ContractType, Context>,
  options?: TanStackStartServerOptions
): TanStackStartRouteHandlers {
  const configured = options ?? {}
  const runtime = createAdapterRuntime(implementation)
  const unsupported = runtime.routes.filter((route) => route.method === 'QUERY')
  if (unsupported.length > 0) {
    throw new TypeError(
      `TanStack Start server routes do not support QUERY routes: ${unsupported.map((route) => route.key.join('.')).join(', ')}`
    )
  }

  type HandlerContext = TanStackStartHandlerInput
  const fetchHandler = createFetchHandler(implementation, {
    contextAdapter: 'tanstack-start',
    contextInput: (_request, input: HandlerContext) => ({
      startContext: input.context,
      startParams: input.params,
    }),
    ...(configured.onError === undefined ? {} : { onError: configured.onError }),
  })
  const handler: TanStackStartRouteHandler = (input) => fetchHandler(input.request, input)
  const handlers: Partial<Record<string, TanStackStartRouteHandler>> = {}
  for (const route of runtime.routes) handlers[route.method] = handler
  return handlers
}
