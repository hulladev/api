import type { Contract } from '@hulla/api'
import { createAdapterRuntime } from '@hulla/api/adapters'
import { createFetchHandler, type FetchServerErrorInput } from '@hulla/api/fetch'
import {
  registerServerContextAdapter,
  type Awaitable,
  type ServerContextInput,
  type ServerExecutable,
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

export type NextServerErrorInput = Omit<FetchServerErrorInput, 'request'> & {
  readonly request: NextRequest
}

export type NextServerOptions = {
  readonly onError?: (input: NextServerErrorInput) => Awaitable<Response | undefined | void>
}

export type NextContextInput<
  ContractType extends Contract = Contract,
  RouteContext extends NextRouteContext = NextRouteContext,
> = ServerContextInput<ContractType> & {
  readonly request: NextRequest
  readonly routeContext: RouteContext
}

/** Gives a server context factory access to the native Next.js request. */
export function withContext<const Context extends object>(
  factory: (input: NextContextInput) => Awaitable<Context>
): <ContractType extends Contract>(input: ServerContextInput<ContractType>) => Awaitable<Context>
export function withContext<RouteContext extends NextRouteContext>(): <const Context extends object>(
  factory: (input: NextContextInput<Contract, RouteContext>) => Awaitable<Context>
) => <ContractType extends Contract>(input: ServerContextInput<ContractType>) => Awaitable<Context>
export function withContext(factory?: (input: NextContextInput) => Awaitable<object>): unknown {
  const bridge = <const Context extends object>(configured: (input: NextContextInput) => Awaitable<Context>) =>
    registerServerContextAdapter('next', (input: ServerContextInput) => {
      const nextInput = input as unknown as NextContextInput
      if (
        !(nextInput.request instanceof Request) ||
        !('cookies' in nextInput.request) ||
        !('nextUrl' in nextInput.request)
      ) {
        throw new TypeError('Next.js context requires a native NextRequest')
      }
      return configured(nextInput)
    })
  return factory === undefined ? bridge : bridge(factory)
}

/** Creates an App Router Route Handler backed by a Hulla server implementation. */
export function createRouteHandler<const ContractType extends Contract, const Context extends object>(
  implementation: ServerExecutable<ContractType, Context>,
  options: NextServerOptions = {}
): NextRouteHandler {
  const unsupported = createAdapterRuntime(implementation).routes.filter((route) => route.method === 'QUERY')
  if (unsupported.length > 0) {
    throw new TypeError(
      `Next.js Route Handlers do not support QUERY routes: ${unsupported.map((route) => route.key.join('.')).join(', ')}`
    )
  }
  const handler = createFetchHandler<ContractType, Context, NextRouteContext>(implementation, {
    contextAdapter: 'next',
    contextInput: (_request, routeContext) => ({ routeContext }),
    ...(options.onError === undefined
      ? {}
      : {
          onError: (input: FetchServerErrorInput) =>
            options.onError?.({ ...input, request: input.request as NextRequest }),
        }),
  })
  return handler as NextRouteHandler
}
