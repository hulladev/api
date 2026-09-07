import { bodyLimit } from '../adapters/body'
import { createAdapterHandler } from '../adapters/runtime'
import type { AdapterDispatchInput, AdapterErrorInput, AdapterPhase, AdapterResponse } from '../adapters/types'
import { readFetchBody, toFetchResponse, writeFetchResponse } from '../adapters/web'
import type { Awaitable } from '../context'
import type { Contract } from '../contract'
import {
  assertAdapterContext,
  createServerAdapter,
  serverContextAdapterId,
  type ServerAdapter,
} from '../server/context'
import type { RouteMetadata, ServerContextInput } from '../server/context'
import type { ServerExecutableFor } from '../server/types'

export type FetchServerPhase = AdapterPhase

export type FetchServerErrorInput<HandlerContext = undefined> = {
  readonly defaultResponse: Response
  readonly error: unknown
  readonly handlerContext: HandlerContext
  readonly phase: FetchServerPhase
  readonly request: Request
  readonly route?: RouteMetadata
}

export type FetchServerOptions<HandlerContext = undefined, AdapterId extends string = 'fetch'> = {
  readonly maxBodyBytes?: number
  readonly preserveRequestBody?: boolean
  /** @internal Adapter identity used to validate native-context factories. */
  readonly contextAdapter?: AdapterId
  /** Adds host-specific values to the server context input. */
  readonly contextInput?: (
    request: Request,
    handlerContext: HandlerContext
  ) => Readonly<Record<string, unknown>> | undefined
  readonly onError?:
    | ((input: FetchServerErrorInput<HandlerContext>) => Awaitable<Response | undefined | void>)
    | undefined
}

export type FetchAdapterErrorInput = Omit<FetchServerErrorInput, 'handlerContext'>

export type FetchAdapterOptions = {
  readonly maxBodyBytes?: number
  readonly preserveRequestBody?: boolean
  readonly onError?: ((input: FetchAdapterErrorInput) => Awaitable<Response | undefined | void>) | undefined
}

export type FetchHandler<HandlerContext = undefined> = [HandlerContext] extends [undefined]
  ? (request: Request) => Promise<Response>
  : (request: Request, context: HandlerContext) => Promise<Response>

export type FetchContextInput<ContractType extends Contract = Contract> = ServerContextInput<ContractType> & {
  readonly request: Request
}

export type FetchAdapter = ServerAdapter<'fetch', { readonly request: Request }> & {
  readonly mount: <const ContractType extends Contract, const Context extends object>(
    implementation: ServerExecutableFor<ContractType, Context, 'fetch'>,
    options?: FetchAdapterOptions
  ) => FetchHandler
}

function pathname(url: string): string {
  const authority = url.indexOf('://')
  const start = authority === -1 ? 0 : url.indexOf('/', authority + 3)
  if (start === -1) return '/'
  const query = url.indexOf('?', start)
  const hash = url.indexOf('#', start)
  const end = query === -1 ? (hash === -1 ? url.length : hash) : hash === -1 ? query : Math.min(query, hash)
  return url.slice(start, end) || '/'
}

function requestHeaders(request: Request): Readonly<Record<string, string>> {
  return Object.fromEntries(request.headers.entries())
}

function requestQuery(url: string): URLSearchParams | undefined {
  const query = url.indexOf('?')
  if (query === -1) return undefined
  const hash = url.indexOf('#', query + 1)
  return new URLSearchParams(url.slice(query + 1, hash === -1 ? undefined : hash))
}

function replacementResponse(response: Response): AdapterResponse {
  return { status: response.status, headers: {}, body: { kind: 'raw', value: response } }
}

/** Creates a Web Fetch handler over the shared transport-neutral route executor. */
export function createFetchHandler<
  const ContractType extends Contract,
  const Context extends object,
  HandlerContext = undefined,
  AdapterId extends string = 'fetch',
>(
  implementation: ServerExecutableFor<ContractType, Context, AdapterId>,
  options: FetchServerOptions<HandlerContext, AdapterId> = {}
): FetchHandler<HandlerContext> {
  assertAdapterContext(implementation.context, options.contextAdapter ?? 'fetch')
  const limit = bodyLimit(options.maxBodyBytes)
  const usesNativeContext = serverContextAdapterId(implementation.context) !== undefined
  const onAdapterError =
    options.onError === undefined
      ? undefined
      : async (input: AdapterErrorInput): Promise<AdapterResponse | undefined> => {
          const replacement = await options.onError?.({
            error: input.error,
            handlerContext: input.hostContext as HandlerContext,
            phase: input.phase,
            request: input.request as Request,
            ...(input.route === undefined ? {} : { route: input.route }),
            defaultResponse: toFetchResponse(input.defaultResponse).clone(),
          })
          return replacement instanceof Response ? replacementResponse(replacement) : undefined
        }
  const dispatch = createAdapterHandler(implementation, onAdapterError === undefined ? {} : { onError: onAdapterError })

  const handler = async (request: Request, handlerContext: HandlerContext) => {
    if (!(request instanceof Request)) throw new TypeError('Fetch handler input must be a Request')
    let headers: Readonly<Record<string, string>> | undefined
    const query = requestQuery(request.url)
    const nativeContext = usesNativeContext ? options.contextInput?.(request, handlerContext) : undefined
    const input: AdapterDispatchInput = {
      request,
      signal: request.signal,
      ...(options.preserveRequestBody === undefined ? {} : { preserveRequestBody: options.preserveRequestBody }),
      ...(usesNativeContext
        ? { contextInput: nativeContext === undefined ? { request } : { ...nativeContext, request } }
        : {}),
      ...(options.onError === undefined ? {} : { hostContext: handlerContext }),
      method: request.method,
      pathname: pathname(request.url),
      readHeaders: () => (headers ??= requestHeaders(request)),
      readBody: (representation, preserveRequest) => readFetchBody(request, representation, preserveRequest, limit),
    }
    const response = await dispatch(query === undefined ? input : { ...input, query })
    return writeFetchResponse(
      response,
      options.onError === undefined ? undefined : (input) => options.onError?.({ ...input, request, handlerContext })
    )
  }
  return handler as FetchHandler<HandlerContext>
}

let fetchAdapterValue: FetchAdapter | undefined

function createFetchAdapter(defaults: FetchAdapterOptions): FetchAdapter {
  return createServerAdapter('fetch', {
    mount: <const ContractType extends Contract, const Context extends object>(
      implementation: ServerExecutableFor<ContractType, Context, 'fetch'>,
      options?: FetchAdapterOptions
    ) => createFetchHandler(implementation, options === undefined ? defaults : { ...defaults, ...options }),
  }) as unknown as FetchAdapter
}

/** Creates a Fetch server adapter with native context and mounting operations. */
export function fetchAdapter(options?: FetchAdapterOptions): FetchAdapter {
  if (options !== undefined) return createFetchAdapter({ ...options })
  return (fetchAdapterValue ??= createFetchAdapter({}))
}
