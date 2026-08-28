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

type TanStackStartAdapterContext<StartContext, Params extends TanStackStartRouteParams> = {
  readonly request: Request
  readonly startContext: StartContext
  readonly startParams: Params
}

export type TanStackStartServerErrorInput<
  StartContext = unknown,
  Params extends TanStackStartRouteParams = TanStackStartRouteParams,
> = Omit<FetchServerErrorInput<TanStackStartHandlerInput<StartContext, Params>>, 'handlerContext'> & {
  readonly startContext: StartContext
  readonly startParams: Params
}

export type TanStackStartServerOptions<
  StartContext = unknown,
  Params extends TanStackStartRouteParams = TanStackStartRouteParams,
> = {
  readonly onError?:
    | ((input: TanStackStartServerErrorInput<StartContext, Params>) => Awaitable<Response | undefined | void>)
    | undefined
}

export type TanStackStartContextInput<
  ContractType extends Contract = Contract,
  StartContext = unknown,
  Params extends TanStackStartRouteParams = TanStackStartRouteParams,
> = ServerContextInput<ContractType> & TanStackStartAdapterContext<StartContext, Params>

export type TanStackStartRouteMethod = 'DELETE' | 'GET' | 'PATCH' | 'POST' | 'PUT'

export type TanStackStartRouteHandlers<
  StartContext = unknown,
  Params extends TanStackStartRouteParams = TanStackStartRouteParams,
> = Readonly<Partial<Record<TanStackStartRouteMethod, TanStackStartRouteHandler<StartContext, Params>>>>

export type TanStackStartAdapter<
  StartContext = unknown,
  Params extends TanStackStartRouteParams = TanStackStartRouteParams,
> = ServerAdapter<'tanstack-start', TanStackStartAdapterContext<StartContext, Params>> & {
  readonly mount: <const ContractType extends Contract, const Context extends object>(
    implementation: ServerExecutableFor<
      ContractType,
      Context,
      'tanstack-start',
      TanStackStartAdapterContext<StartContext, Params>
    >,
    options?: TanStackStartServerOptions<StartContext, Params>
  ) => TanStackStartRouteHandlers<StartContext, Params>
}

/** Creates the method-handler map mounted by a TanStack Start wildcard server route. */
function createServerRouteHandlers<
  const ContractType extends Contract,
  const Context extends object,
  StartContext = unknown,
  Params extends TanStackStartRouteParams = TanStackStartRouteParams,
>(
  implementation: ServerExecutableFor<
    ContractType,
    Context,
    'tanstack-start',
    TanStackStartAdapterContext<StartContext, Params>
  >,
  options?: TanStackStartServerOptions<StartContext, Params>
): TanStackStartRouteHandlers<StartContext, Params> {
  const configured = options ?? {}
  const runtime = createAdapterRuntime(implementation)
  const unsupported = runtime.routes.filter((route) => route.method === 'QUERY')
  if (unsupported.length > 0) {
    throw new TypeError(
      `TanStack Start server routes do not support QUERY routes: ${unsupported.map((route) => route.key.join('.')).join(', ')}`
    )
  }

  type HandlerContext = TanStackStartHandlerInput<StartContext, Params>
  const fetchHandler = createFetchHandler<ContractType, Context, HandlerContext, 'tanstack-start'>(implementation, {
    contextAdapter: 'tanstack-start',
    contextInput: (_request, input: HandlerContext) => ({
      startContext: input.context,
      startParams: input.params,
    }),
    ...(configured.onError === undefined
      ? {}
      : {
          onError: ({ handlerContext, ...input }: FetchServerErrorInput<HandlerContext>) =>
            configured.onError?.({
              ...input,
              startContext: handlerContext.context,
              startParams: handlerContext.params,
            }),
        }),
  })
  const handler: TanStackStartRouteHandler<StartContext, Params> = (input) => fetchHandler(input.request, input)
  const handlers: Partial<Record<string, TanStackStartRouteHandler<StartContext, Params>>> = {}
  for (const route of runtime.routes) handlers[route.method] = handler
  return handlers
}

let tanStackStartAdapterValue: unknown

function createTanStackStartAdapter<StartContext, Params extends TanStackStartRouteParams>(
  defaults: TanStackStartServerOptions<StartContext, Params>
): TanStackStartAdapter<StartContext, Params> {
  return createServerAdapter('tanstack-start', {
    mount: <const ContractType extends Contract, const Context extends object>(
      implementation: ServerExecutableFor<
        ContractType,
        Context,
        'tanstack-start',
        TanStackStartAdapterContext<StartContext, Params>
      >,
      options?: TanStackStartServerOptions<StartContext, Params>
    ) => createServerRouteHandlers(implementation, options === undefined ? defaults : { ...defaults, ...options }),
  }) as unknown as TanStackStartAdapter<StartContext, Params>
}

/** Creates a TanStack Start adapter with native context and mounting operations. */
export function tanStackStartAdapter<
  StartContext = unknown,
  Params extends TanStackStartRouteParams = TanStackStartRouteParams,
>(options?: TanStackStartServerOptions<StartContext, Params>): TanStackStartAdapter<StartContext, Params> {
  if (options !== undefined) return createTanStackStartAdapter({ ...options })
  tanStackStartAdapterValue ??= createTanStackStartAdapter<unknown, TanStackStartRouteParams>({})
  return tanStackStartAdapterValue as TanStackStartAdapter<StartContext, Params>
}
