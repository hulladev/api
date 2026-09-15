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
import type { NextRequest } from 'next/server'

export type NextRouteParams = Readonly<Record<string, string | string[] | undefined>>

export type NextRouteContext<Params extends NextRouteParams = NextRouteParams> = {
  readonly params: Promise<Params>
}

export type NextRouteHandler<RouteContext extends NextRouteContext = NextRouteContext> = (
  request: NextRequest,
  context: RouteContext
) => Promise<Response>

type NextAdapterContext<RouteContext extends NextRouteContext> = {
  readonly request: NextRequest
  readonly routeContext: RouteContext
}

export type NextServerErrorInput<RouteContext extends NextRouteContext = NextRouteContext> = Omit<
  FetchServerErrorInput<RouteContext>,
  'handlerContext' | 'request'
> & {
  readonly request: NextRequest
  readonly routeContext: RouteContext
}

export type NextServerOptions<RouteContext extends NextRouteContext = NextRouteContext> = {
  readonly onError?: ((input: NextServerErrorInput<RouteContext>) => Awaitable<Response | undefined | void>) | undefined
}

export type NextContextInput<
  ContractType extends Contract = Contract,
  RouteContext extends NextRouteContext = NextRouteContext,
> = ServerContextInput<ContractType> & NextAdapterContext<RouteContext>

export type NextAdapter<RouteContext extends NextRouteContext = NextRouteContext> = ServerAdapter<
  'next',
  NextAdapterContext<RouteContext>
> & {
  readonly mount: <const ContractType extends Contract, const Context extends object>(
    implementation: ServerExecutableFor<ContractType, Context, 'next', NextAdapterContext<RouteContext>>,
    options?: NextServerOptions<RouteContext>
  ) => NextRouteHandler<RouteContext>
}

/** Creates an App Router Route Handler backed by an @hulla/api server implementation. */
function createRouteHandler<
  const ContractType extends Contract,
  const Context extends object,
  RouteContext extends NextRouteContext = NextRouteContext,
>(
  implementation: ServerExecutableFor<ContractType, Context, 'next', NextAdapterContext<RouteContext>>,
  options: NextServerOptions<RouteContext> = {}
): NextRouteHandler<RouteContext> {
  const unsupported = createAdapterRuntime(implementation).routes.filter((route) => route.method === 'QUERY')
  if (unsupported.length > 0) {
    throw new TypeError(
      `Next.js Route Handlers do not support QUERY routes: ${unsupported.map((route) => route.key.join('.')).join(', ')}`
    )
  }
  const handler = createFetchHandler<ContractType, Context, RouteContext, 'next'>(implementation, {
    contextAdapter: 'next',
    contextInput: (_request, routeContext) => ({ routeContext }),
    ...(options.onError === undefined
      ? {}
      : {
          onError: ({ handlerContext, ...input }: FetchServerErrorInput<RouteContext>) =>
            options.onError?.({ ...input, request: input.request as NextRequest, routeContext: handlerContext }),
        }),
  })
  return handler as NextRouteHandler<RouteContext>
}

let nextAdapterValue: unknown

function createNextAdapter<RouteContext extends NextRouteContext>(
  defaults: NextServerOptions<RouteContext>
): NextAdapter<RouteContext> {
  return createServerAdapter('next', {
    mount: <const ContractType extends Contract, const Context extends object>(
      implementation: ServerExecutableFor<ContractType, Context, 'next', NextAdapterContext<RouteContext>>,
      options?: NextServerOptions<RouteContext>
    ) => createRouteHandler(implementation, options === undefined ? defaults : { ...defaults, ...options }),
  }) as unknown as NextAdapter<RouteContext>
}

/** Creates a Next.js adapter with native context and mounting operations. */
export function nextAdapter<RouteContext extends NextRouteContext = NextRouteContext>(
  options?: NextServerOptions<RouteContext>
): NextAdapter<RouteContext> {
  if (options !== undefined) return createNextAdapter({ ...options })
  nextAdapterValue ??= createNextAdapter<NextRouteContext>({})
  return nextAdapterValue as NextAdapter<RouteContext>
}
