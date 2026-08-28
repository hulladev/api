import type { Contract } from '@hulla/api'
import {
  createAdapterRuntime,
  type AdapterErrorInput,
  type AdapterResponse,
  type AdapterResponseBody,
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
  readonly onError?: ((input: H3ServerErrorInput) => Awaitable<Response | undefined | void>) | undefined
}

export type H3Adapter<App extends H3App = H3App> = ServerAdapter<'h3', H3AdapterContext> & {
  readonly mount: <const ContractType extends Contract, const Context extends object>(
    implementation: ServerExecutableFor<ContractType, Context, 'h3', H3AdapterContext>,
    options?: H3ServerOptions
  ) => App
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
      throw new TypeError(`Unsupported H3 request body representation ${representation}`)
  }
}

function readableStream(source: unknown): ReadableStream<Uint8Array> {
  const stream = source as AsyncIterable<unknown> & Iterable<unknown>
  const iterator =
    typeof stream?.[Symbol.asyncIterator] === 'function'
      ? stream[Symbol.asyncIterator]()
      : typeof stream?.[Symbol.iterator] === 'function'
        ? stream[Symbol.iterator]()
        : undefined
  if (iterator === undefined) throw new TypeError('Stream response body must be iterable')

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

type FetchBodyKind = Exclude<AdapterResponseBody['kind'], 'json' | 'raw'>

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
  const result = new Response(responseBody(body.kind, body.value), {
    status: response.status,
    headers: response.headers,
  })
  if (body.kind === 'form-data') void result.headers.get('content-type')
  return result
}

function replacementResponse(response: Response): AdapterResponse {
  return { status: response.status, headers: {}, body: { kind: 'raw', value: response } }
}

function createRouteHandler(route: AdapterRoute, usesNativeContext: boolean, includeHostContext: boolean): H3Handler {
  return async (h3Event) => {
    const request = h3Event.req as Request
    const nativeContext: H3AdapterContext = { request, h3Event }
    const input: AdapterRouteInput = {
      request,
      ...(usesNativeContext ? { contextInput: nativeContext } : {}),
      params: getRouterParams(h3Event, { decode: true }),
      ...(h3Event.url.search === '' ? {} : { query: h3Event.url.searchParams }),
      readHeaders: () => Object.fromEntries(request.headers.entries()),
      readBody: (representation, preserveRequest) => readBody(request, representation, preserveRequest),
      ...(includeHostContext ? { hostContext: nativeContext } : {}),
    }
    return toResponse(await route.execute(input))
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
              defaultResponse: toResponse(input.defaultResponse).clone(),
            })
            return replacement instanceof Response ? replacementResponse(replacement) : undefined
          },
        }
  )
  for (const route of runtime.routes) {
    app.on(
      route.method as NativeH3Method,
      route.path,
      createRouteHandler(route, usesNativeContext, options.onError !== undefined)
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
