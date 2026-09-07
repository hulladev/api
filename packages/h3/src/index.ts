import type { Contract } from '@hulla/api'
import { bodyLimit, readFetchBody, toFetchResponse, writeFetchResponse } from '@hulla/api/adapters'
import {
  createAdapterRuntime,
  type AdapterErrorInput,
  type AdapterResponse,
  type AdapterRoute,
  type AdapterRouteInput,
} from '@hulla/api/adapters'
import {
  assertAdapterContext,
  createServerAdapter,
  serverContextAdapterId,
  type Awaitable,
  type ServerAdapter,
  type ServerContextInput,
  type ServerExecutableFor,
} from '@hulla/api/server'
import type {
  EventHandler as NativeH3Handler,
  H3 as NativeH3App,
  H3Event as NativeH3Event,
  HTTPMethod as NativeH3Method,
} from 'h3'
import { getRouterParams } from 'h3'

export type H3App = NativeH3App
export type H3Event = NativeH3Event
export type H3Handler = NativeH3Handler

type H3AdapterContext = {
  readonly request: Request
  readonly h3Event: H3Event
}

export type H3ContextInput<ContractType extends Contract = Contract> = ServerContextInput<ContractType> &
  H3AdapterContext

export type H3ServerErrorInput = Omit<AdapterErrorInput, 'defaultResponse' | 'hostContext' | 'request'> &
  H3AdapterContext & {
    readonly defaultResponse: Response
  }

export type H3ServerOptions = {
  readonly preserveRequestBody?: boolean
  readonly maxBodyBytes?: number

  readonly onError?: ((input: H3ServerErrorInput) => Awaitable<Response | undefined | void>) | undefined
}

export type H3Adapter<App extends H3App = H3App> = ServerAdapter<'h3', H3AdapterContext> & {
  readonly mount: <const ContractType extends Contract, const Context extends object>(
    implementation: ServerExecutableFor<ContractType, Context, 'h3', H3AdapterContext>,
    options?: H3ServerOptions
  ) => App
}

async function readBody(
  request: Request,
  representation: string,
  preserveRequest: boolean,
  limit: number
): Promise<unknown> {
  return readFetchBody(request, representation, preserveRequest, limit)
}

function replacementResponse(response: Response): AdapterResponse {
  return { status: response.status, headers: {}, body: { kind: 'raw', value: response } }
}

function createRouteHandler(
  route: AdapterRoute,
  usesNativeContext: boolean,
  includeHostContext: boolean,
  options: H3ServerOptions
): H3Handler {
  const limit = bodyLimit(options.maxBodyBytes)
  return async (h3Event) => {
    const request = h3Event.req as Request
    const nativeContext: H3AdapterContext = { request, h3Event }
    const input: AdapterRouteInput = {
      request,
      signal: request.signal,
      preserveRequestBody: options.preserveRequestBody ?? false,
      ...(usesNativeContext ? { contextInput: nativeContext } : {}),
      params: getRouterParams(h3Event, { decode: true }),
      ...(h3Event.url.search === '' ? {} : { query: h3Event.url.searchParams }),
      readHeaders: () => Object.fromEntries(request.headers.entries()),
      readBody: (representation, preserveRequest) => readBody(request, representation, preserveRequest, limit),
      ...(includeHostContext ? { hostContext: nativeContext } : {}),
    }
    return writeFetchResponse(
      await route.execute(input),
      options.onError === undefined
        ? undefined
        : (error) =>
            options.onError?.({
              ...error,
              ...nativeContext,
              route: { key: route.key, method: route.method, path: route.path },
            })
    )
  }
}

function mountH3<const App extends H3App, const ContractType extends Contract, const Context extends object>(
  app: App,
  implementation: ServerExecutableFor<ContractType, Context, 'h3', H3AdapterContext>,
  options: H3ServerOptions
): App {
  assertAdapterContext(implementation.context, 'h3')
  const usesNativeContext = serverContextAdapterId(implementation.context) !== undefined
  const runtime = createAdapterRuntime(
    implementation,
    options.onError === undefined
      ? {}
      : {
          onError: async ({ hostContext, ...input }) => {
            const nativeContext = hostContext as H3AdapterContext
            const replacement = await options.onError?.({
              ...input,
              ...nativeContext,
              defaultResponse: toFetchResponse(input.defaultResponse).clone(),
            })
            return replacement instanceof Response ? replacementResponse(replacement) : undefined
          },
        }
  )
  for (const route of runtime.routes) {
    app.on(
      route.method as NativeH3Method,
      route.path,
      createRouteHandler(route, usesNativeContext, options.onError !== undefined, options)
    )
  }
  return app
}

/** Creates an H3 adapter bound to one caller-owned application. */
export function h3Adapter<const App extends H3App>(app: App, defaults: H3ServerOptions = {}): H3Adapter<App> {
  const configuredDefaults = { ...defaults }
  return createServerAdapter('h3', {
    mount: <const ContractType extends Contract, const Context extends object>(
      implementation: ServerExecutableFor<ContractType, Context, 'h3', H3AdapterContext>,
      options?: H3ServerOptions
    ) =>
      mountH3(app, implementation, options === undefined ? configuredDefaults : { ...configuredDefaults, ...options }),
  }) as unknown as H3Adapter<App>
}
