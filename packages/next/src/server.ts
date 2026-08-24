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

export type NextAdapter<RouteContext extends NextRouteContext = NextRouteContext> = ServerAdapter<
  'next',
  NextAdapterContext<RouteContext>
>

const nextAdapterDescriptor = /* @__PURE__ */ createServerAdapter('next') as NextAdapter

export function nextAdapter<RouteContext extends NextRouteContext = NextRouteContext>(): NextAdapter<RouteContext> {
  return nextAdapterDescriptor as NextAdapter<RouteContext>
}

export type NextServerErrorInput<RouteContext extends NextRouteContext = NextRouteContext> = Omit<
  FetchServerErrorInput<RouteContext>,
  'handlerContext' | 'request'
> & {
  readonly request: NextRequest
  readonly routeContext: RouteContext
}

export type NextServerOptions<RouteContext extends NextRouteContext = NextRouteContext> = {
  readonly onError?: (input: NextServerErrorInput<RouteContext>) => Awaitable<Response | undefined | void>
}

export type NextContextInput<
  ContractType extends Contract = Contract,
  RouteContext extends NextRouteContext = NextRouteContext,
> = ServerContextInput<ContractType> & NextAdapterContext<RouteContext>

/** Creates an App Router Route Handler backed by a Hulla server implementation. */
export function createRouteHandler<
  const ContractType extends Contract,
  const Context extends object,
  RouteContext extends NextRouteContext = NextRouteContext,
>(
  implementation: ServerExecutableFor<ContractType, Context, NextAdapter<RouteContext>>,
  options: NextServerOptions<RouteContext> = {}
): NextRouteHandler<RouteContext> {
  const unsupported = createAdapterRuntime(implementation).routes.filter((route) => route.method === 'QUERY')
  if (unsupported.length > 0) {
    throw new TypeError(
      `Next.js Route Handlers do not support QUERY routes: ${unsupported.map((route) => route.key.join('.')).join(', ')}`
    )
  }
  const handler = createFetchHandler<ContractType, Context, RouteContext, NextAdapter<RouteContext>>(implementation, {
    contextAdapter: nextAdapterDescriptor as NextAdapter<RouteContext>,
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
