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
import type Elysia from 'elysia'
import type { AnyElysia, InferContext } from 'elysia'

export type ElysiaContext<App extends AnyElysia = Elysia> = Omit<InferContext<App>, 'params'> & {
  readonly params: Readonly<Record<string, string>>
}

type ElysiaAdapterContext<App extends AnyElysia> = {
  readonly request: Request
  readonly elysiaContext: ElysiaContext<App>
}

export type ElysiaContextInput<
  ContractType extends Contract = Contract,
  App extends AnyElysia = Elysia,
> = ServerContextInput<ContractType> & ElysiaAdapterContext<App>

export type ElysiaServerErrorInput<App extends AnyElysia = Elysia> = Omit<
  AdapterErrorInput,
  'defaultResponse' | 'hostContext' | 'request'
> &
  ElysiaAdapterContext<App> & {
    readonly defaultResponse: Response
  }

export type ElysiaServerOptions<App extends AnyElysia = Elysia> = {
  readonly preserveRequestBody?: boolean
  readonly maxBodyBytes?: number

  readonly onError?: ((input: ElysiaServerErrorInput<App>) => Awaitable<Response | undefined | void>) | undefined
}

export type ElysiaAdapter<App extends AnyElysia = Elysia> = ServerAdapter<'elysia', ElysiaAdapterContext<App>> & {
  readonly mount: <const ContractType extends Contract, const Context extends object>(
    implementation: ServerExecutableFor<ContractType, Context, 'elysia', ElysiaAdapterContext<App>>,
    options?: ElysiaServerOptions<App>
  ) => App
}

function requestQuery(url: string): URLSearchParams | undefined {
  const start = url.indexOf('?')
  if (start === -1) return undefined
  const hash = url.indexOf('#', start + 1)
  return new URLSearchParams(url.slice(start + 1, hash === -1 ? undefined : hash))
}

function parsedBody(context: ElysiaContext<AnyElysia>, representation: string): unknown {
  const value = context['body']
  switch (representation) {
    case 'json':
    case 'text':
      return value
    case 'bytes':
      if (value instanceof Uint8Array) return value
      if (value instanceof ArrayBuffer) return new Uint8Array(value)
      throw new TypeError('Parsed Elysia byte request body must be ArrayBuffer or Uint8Array')
    case 'form-data':
      if (value instanceof FormData) return value
      throw new TypeError('Parsed Elysia form data request body must be FormData')
    default:
      throw new TypeError(`Unsupported Elysia request body representation ${representation}`)
  }
}

async function readBody(
  nativeContext: ElysiaAdapterContext<AnyElysia>,
  representation: string,
  preserveRequest: boolean,
  limit: number
): Promise<unknown> {
  if (nativeContext.request.bodyUsed) return parsedBody(nativeContext.elysiaContext, representation)
  return readFetchBody(nativeContext.request, representation, preserveRequest, limit)
}

function requestHeaders(request: Request): Readonly<Record<string, string>> {
  return Object.fromEntries(request.headers.entries())
}

function replacementResponse(response: Response): AdapterResponse {
  return { status: response.status, headers: {}, body: { kind: 'raw', value: response } }
}

function createRouteHandler<App extends AnyElysia>(
  route: AdapterRoute,
  usesNativeContext: boolean,
  includeHostContext: boolean,
  options: ElysiaServerOptions<App>
): (context: ElysiaContext<App>) => Promise<Response> {
  const limit = bodyLimit(options.maxBodyBytes)
  return async (elysiaContext) => {
    const request = elysiaContext.request
    const query = requestQuery(request.url)
    const nativeContext: ElysiaAdapterContext<App> = { request, elysiaContext }
    const input: AdapterRouteInput = {
      request,
      signal: request.signal,
      preserveRequestBody: options.preserveRequestBody ?? false,
      ...(usesNativeContext ? { contextInput: nativeContext } : {}),
      params: elysiaContext.params,
      ...(query === undefined ? {} : { query }),
      readHeaders: () => requestHeaders(request),
      readBody: (representation, preserveRequest) =>
        readBody(nativeContext as ElysiaAdapterContext<AnyElysia>, representation, preserveRequest, limit),
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

function mountElysia<const App extends AnyElysia, const ContractType extends Contract, const Context extends object>(
  app: App,
  implementation: ServerExecutableFor<ContractType, Context, 'elysia', ElysiaAdapterContext<App>>,
  options: ElysiaServerOptions<App>
): App {
  assertAdapterContext(implementation.context, 'elysia')
  const usesNativeContext = serverContextAdapterId(implementation.context) !== undefined
  const runtime = createAdapterRuntime(
    implementation,
    options.onError === undefined
      ? {}
      : {
          onError: async ({ hostContext, ...input }) => {
            const nativeContext = hostContext as ElysiaAdapterContext<App>
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
    app.route(
      route.method,
      route.path,
      createRouteHandler<App>(route, usesNativeContext, options.onError !== undefined, options) as never
    )
  }
  return app
}

/** Creates an Elysia adapter bound to one caller-owned application. */
export function elysiaAdapter<const App extends AnyElysia>(
  app: App,
  defaults: ElysiaServerOptions<App> = {}
): ElysiaAdapter<App> {
  const configuredDefaults = { ...defaults }
  return createServerAdapter('elysia', {
    mount: <const ContractType extends Contract, const Context extends object>(
      implementation: ServerExecutableFor<ContractType, Context, 'elysia', ElysiaAdapterContext<App>>,
      options?: ElysiaServerOptions<App>
    ) =>
      mountElysia(
        app,
        implementation,
        options === undefined ? configuredDefaults : { ...configuredDefaults, ...options }
      ),
  }) as unknown as ElysiaAdapter<App>
}
