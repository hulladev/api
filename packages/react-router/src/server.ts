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

export type ReactRouterRouteParams = Readonly<Record<string, string | undefined>>

export type ReactRouterHandlerInput<
  LoadContext = unknown,
  Params extends ReactRouterRouteParams = ReactRouterRouteParams,
> = {
  readonly context: LoadContext
  readonly params: Params
  readonly request: Request
}

export type ReactRouterRouteHandler<
  LoadContext = unknown,
  Params extends ReactRouterRouteParams = ReactRouterRouteParams,
> = (input: ReactRouterHandlerInput<LoadContext, Params>) => Promise<Response>

type ReactRouterAdapterContext<LoadContext, Params extends ReactRouterRouteParams> = {
  readonly request: Request
  readonly reactRouterContext: LoadContext
  readonly reactRouterParams: Params
}

export type ReactRouterContextInput<
  ContractType extends Contract = Contract,
  LoadContext = unknown,
  Params extends ReactRouterRouteParams = ReactRouterRouteParams,
> = ServerContextInput<ContractType> & ReactRouterAdapterContext<LoadContext, Params>

export type ReactRouterServerErrorInput<
  LoadContext = unknown,
  Params extends ReactRouterRouteParams = ReactRouterRouteParams,
> = Omit<FetchServerErrorInput<ReactRouterHandlerInput<LoadContext, Params>>, 'handlerContext'> & {
  readonly reactRouterContext: LoadContext
  readonly reactRouterParams: Params
}

export type ReactRouterServerOptions<
  LoadContext = unknown,
  Params extends ReactRouterRouteParams = ReactRouterRouteParams,
> = {
  readonly onError?:
    | ((input: ReactRouterServerErrorInput<LoadContext, Params>) => Awaitable<Response | undefined | void>)
    | undefined
}

export type ReactRouterRouteHandlers<
  LoadContext = unknown,
  Params extends ReactRouterRouteParams = ReactRouterRouteParams,
> = {
  readonly action: ReactRouterRouteHandler<LoadContext, Params>
  readonly loader: ReactRouterRouteHandler<LoadContext, Params>
}

export type ReactRouterAdapter<
  LoadContext = unknown,
  Params extends ReactRouterRouteParams = ReactRouterRouteParams,
> = ServerAdapter<'react-router', ReactRouterAdapterContext<LoadContext, Params>> & {
  readonly mount: <const ContractType extends Contract, const Context extends object>(
    implementation: ServerExecutableFor<
      ContractType,
      Context,
      'react-router',
      ReactRouterAdapterContext<LoadContext, Params>
    >,
    options?: ReactRouterServerOptions<LoadContext, Params>
  ) => ReactRouterRouteHandlers<LoadContext, Params>
}

/** Creates the loader and action exported by a React Router v7 resource route. */
function createResourceRouteHandlers<
  const ContractType extends Contract,
  const Context extends object,
  LoadContext = unknown,
  Params extends ReactRouterRouteParams = ReactRouterRouteParams,
>(
  implementation: ServerExecutableFor<
    ContractType,
    Context,
    'react-router',
    ReactRouterAdapterContext<LoadContext, Params>
  >,
  options: ReactRouterServerOptions<LoadContext, Params> = {}
): ReactRouterRouteHandlers<LoadContext, Params> {
  const unsupported = createAdapterRuntime(implementation).routes.filter((route) => route.method === 'QUERY')
  if (unsupported.length > 0) {
    throw new TypeError(
      `React Router resource routes do not support QUERY routes: ${unsupported.map((route) => route.key.join('.')).join(', ')}`
    )
  }

  type HandlerContext = ReactRouterHandlerInput<LoadContext, Params>
  const handler = createFetchHandler<ContractType, Context, HandlerContext, 'react-router'>(implementation, {
    contextAdapter: 'react-router',
    contextInput: (_request, input) => ({
      reactRouterContext: input.context,
      reactRouterParams: input.params,
    }),
    ...(options.onError === undefined
      ? {}
      : {
          onError: ({ handlerContext, ...input }: FetchServerErrorInput<HandlerContext>) =>
            options.onError?.({
              ...input,
              reactRouterContext: handlerContext.context,
              reactRouterParams: handlerContext.params,
            }),
        }),
  })
  const action: ReactRouterRouteHandler<LoadContext, Params> = (input) => handler(input.request, input)
  const loader: ReactRouterRouteHandler<LoadContext, Params> = async (input) => {
    if (input.request.method !== 'HEAD') return handler(input.request, input)

    const response = await handler(new Request(input.request, { method: 'GET' }), input)
    return new Response(null, response)
  }
  return Object.freeze({ action, loader })
}

let reactRouterAdapterValue: unknown

function createReactRouterAdapter<LoadContext, Params extends ReactRouterRouteParams>(
  defaults: ReactRouterServerOptions<LoadContext, Params>
): ReactRouterAdapter<LoadContext, Params> {
  return createServerAdapter('react-router', {
    mount: <const ContractType extends Contract, const Context extends object>(
      implementation: ServerExecutableFor<
        ContractType,
        Context,
        'react-router',
        ReactRouterAdapterContext<LoadContext, Params>
      >,
      options?: ReactRouterServerOptions<LoadContext, Params>
    ) => createResourceRouteHandlers(implementation, options === undefined ? defaults : { ...defaults, ...options }),
  }) as unknown as ReactRouterAdapter<LoadContext, Params>
}

/** Creates a React Router v7 adapter with native route context and mounting operations. */
export function reactRouterAdapter<
  LoadContext = unknown,
  Params extends ReactRouterRouteParams = ReactRouterRouteParams,
>(options?: ReactRouterServerOptions<LoadContext, Params>): ReactRouterAdapter<LoadContext, Params> {
  if (options !== undefined) return createReactRouterAdapter({ ...options })
  reactRouterAdapterValue ??= createReactRouterAdapter<unknown, ReactRouterRouteParams>({})
  return reactRouterAdapterValue as ReactRouterAdapter<LoadContext, Params>
}
