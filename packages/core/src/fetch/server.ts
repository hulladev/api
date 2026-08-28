import { createAdapterHandler } from '../adapters/runtime'
import type { AdapterDispatchInput, AdapterErrorInput, AdapterPhase, AdapterResponse } from '../adapters/types'
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

async function readBody(request: Request, representation: string, preserveRequest: boolean): Promise<unknown> {
  const source = preserveRequest ? request.clone() : request
  switch (representation) {
    case 'json':
      return source.json()
    case 'text':
      return source.text()
    case 'bytes':
      return new Uint8Array(await source.arrayBuffer())
    case 'form-data':
      return source.formData()
    default:
      throw new TypeError(`Unsupported Fetch request body representation ${representation}`)
  }
}

function readableStream(source: unknown): ReadableStream<Uint8Array> {
  const stream = source as AsyncIterable<unknown> & Iterable<unknown>
  const iterator =
    typeof stream[Symbol.asyncIterator] === 'function' ? stream[Symbol.asyncIterator]() : stream[Symbol.iterator]()
  return new ReadableStream<Uint8Array>({
    async pull(controller) {
      try {
        const result = await iterator.next()
        if (result.done) controller.close()
        else if (result.value instanceof Uint8Array) controller.enqueue(result.value)
        else controller.error(new TypeError('Stream chunk must be Uint8Array'))
      } catch (error) {
        controller.error(error)
      }
    },
    async cancel(reason) {
      await iterator.return?.(reason)
    },
  })
}

type FetchBodyKind = Exclude<AdapterResponse['body']['kind'], 'json' | 'raw'>

function responseBody(kind: FetchBodyKind, value: unknown): BodyInit | null {
  switch (kind) {
    case 'empty':
      return null
    case 'text':
      if (typeof value !== 'string') throw new TypeError('Text adapter response body must be a string')
      return value
    case 'bytes':
      if (!(value instanceof Uint8Array)) throw new TypeError('Byte adapter response body must be Uint8Array')
      return value as BodyInit
    case 'form-data':
      if (!(value instanceof FormData)) throw new TypeError('Form data response body must be FormData')
      return value
    case 'stream':
      return readableStream(value) as unknown as BodyInit
  }
}

function toResponse(response: AdapterResponse): Response {
  const body = response.body
  if (body.kind === 'raw') {
    if (!(body.value instanceof Response) || body.value.status !== response.status) {
      throw new TypeError('Raw Fetch response status must match its declared contract status')
    }
    return body.value
  }
  if (body.kind === 'json') {
    if (body.value === undefined) throw new TypeError('JSON response body cannot encode to undefined')
    return Response.json(body.value, { status: response.status, headers: response.headers })
  }
  const fetchResponse = new Response(responseBody(body.kind, body.value), {
    status: response.status,
    headers: response.headers,
  })
  if (body.kind === 'form-data') void fetchResponse.headers.get('content-type')
  return fetchResponse
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
            defaultResponse: toResponse(input.defaultResponse).clone(),
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
      ...(usesNativeContext
        ? { contextInput: nativeContext === undefined ? { request } : { ...nativeContext, request } }
        : {}),
      ...(options.onError === undefined ? {} : { hostContext: handlerContext }),
      method: request.method,
      pathname: pathname(request.url),
      readHeaders: () => (headers ??= requestHeaders(request)),
      readBody: (representation, preserveRequest) => readBody(request, representation, preserveRequest),
    }
    const response = await dispatch(query === undefined ? input : { ...input, query })
    return toResponse(response)
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
