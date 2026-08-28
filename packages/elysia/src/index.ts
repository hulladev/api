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
  preserveRequest: boolean
): Promise<unknown> {
  const request = nativeContext.request
  if (request.bodyUsed) return parsedBody(nativeContext.elysiaContext, representation)
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
      throw new TypeError(`Unsupported Elysia request body representation ${representation}`)
  }
}

function requestHeaders(request: Request): Readonly<Record<string, string>> {
  return Object.fromEntries(request.headers.entries())
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

function createRouteHandler<App extends AnyElysia>(
  route: AdapterRoute,
  usesNativeContext: boolean,
  includeHostContext: boolean
): (context: ElysiaContext<App>) => Promise<Response> {
  return async (elysiaContext) => {
    const request = elysiaContext.request
    const query = requestQuery(request.url)
    const nativeContext: ElysiaAdapterContext<App> = { request, elysiaContext }
    const input: AdapterRouteInput = {
      request,
      ...(usesNativeContext ? { contextInput: nativeContext } : {}),
      params: elysiaContext.params,
      ...(query === undefined ? {} : { query }),
      readHeaders: () => requestHeaders(request),
      readBody: (representation, preserveRequest) =>
        readBody(nativeContext as ElysiaAdapterContext<AnyElysia>, representation, preserveRequest),
      ...(includeHostContext ? { hostContext: nativeContext } : {}),
    }
    return toResponse(await route.execute(input))
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
              defaultResponse: toResponse(input.defaultResponse).clone(),
            })
            return replacement instanceof Response ? replacementResponse(replacement) : undefined
          },
        }
  )
  for (const route of runtime.routes) {
    app.route(
      route.method,
      route.path,
      createRouteHandler<App>(route, usesNativeContext, options.onError !== undefined) as never
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
