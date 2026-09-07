import type { Contract } from '@hulla/api'
import { toFetchHeaders } from '@hulla/api/adapters'
import {
  createAdapterRuntime,
  type AdapterBody,
  type AdapterErrorInput,
  type AdapterResponse,
  type AdapterRoute,
  type AdapterRouteInput,
} from '@hulla/api/adapters'
import { nodeRequestLifetime } from '@hulla/api/adapters/node'
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
  FastifyInstance as NativeFastifyInstance,
  FastifyReply as NativeFastifyReply,
  FastifyRequest as NativeFastifyRequest,
  RouteHandlerMethod as NativeFastifyHandler,
} from 'fastify'

export type FastifyInstance = NativeFastifyInstance
export type FastifyRequest = NativeFastifyRequest
export type FastifyReply = NativeFastifyReply
export type FastifyHandler = NativeFastifyHandler

type FastifyAdapterContext = {
  readonly request: FastifyRequest
  readonly reply: FastifyReply
}

export type FastifyContextInput<ContractType extends Contract = Contract> = ServerContextInput<ContractType> &
  FastifyAdapterContext

export type FastifyServerErrorInput = Omit<AdapterErrorInput, 'hostContext' | 'request'> & FastifyAdapterContext

export type FastifyServerOptions = {
  readonly onError?: ((input: FastifyServerErrorInput) => Awaitable<AdapterResponse | undefined | void>) | undefined
}

export type FastifyAdapter<App extends FastifyInstance = FastifyInstance> = ServerAdapter<
  'fastify',
  FastifyAdapterContext
> & {
  readonly mount: <const ContractType extends Contract, const Context extends object>(
    implementation: ServerExecutableFor<ContractType, Context, 'fastify', FastifyAdapterContext>,
    options?: FastifyServerOptions
  ) => App
}

function requestHeaders(request: FastifyRequest): Readonly<Record<string, string>> {
  const headers: Record<string, string> = {}
  for (const [name, value] of Object.entries(request.headers)) {
    if (value === undefined || name.startsWith(':')) continue
    headers[name] = typeof value === 'string' ? value : value.join(', ')
  }
  return headers
}

function missingBodyParser(representation: string): Promise<never> {
  return Promise.reject(
    new TypeError(
      `Fastify request body is unavailable; install a matching content-type parser for ${representation} bodies`
    )
  )
}

function responseSetCookies(headers: Headers): readonly string[] {
  const compatible = headers as Headers & { getSetCookie?: () => readonly string[] }
  return compatible.getSetCookie?.() ?? []
}

function writeResponseHeaders(source: Headers, target: FastifyReply): void {
  const setCookies = responseSetCookies(source)
  source.forEach((value, name) => {
    if (name !== 'set-cookie' || setCookies.length === 0) target.header(name, value)
  })
  for (const cookie of setCookies) target.header('set-cookie', cookie)
}

function writeAdapterHeaders(source: AdapterResponse['headers'], target: FastifyReply): void {
  for (const [name, value] of Object.entries(source)) target.header(name, value)
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
        else throw new TypeError('Stream chunk must be Uint8Array')
      } catch (error) {
        try {
          await iterator.return?.()
        } catch {
          /* Preserve the stream error. */
        }
        controller.error(error)
      }
    },
    async cancel(reason) {
      await iterator.return?.(reason)
    },
  })
}

function writeFetchResponse(source: Response, target: FastifyReply): FastifyReply {
  target.code(source.status)
  writeResponseHeaders(source.headers, target)
  return target.send(source.body ?? undefined)
}

function writeAdapterResponse(source: AdapterResponse, target: FastifyReply): FastifyReply {
  const body = source.body
  if (body.kind === 'raw') {
    if (!(body.value instanceof Response) || body.value.status !== source.status) {
      throw new TypeError('Raw Fetch response status must match its declared contract status')
    }
    return writeFetchResponse(body.value, target)
  }
  if (body.kind === 'form-data') {
    if (!(body.value instanceof FormData)) throw new TypeError('Form data response body must be FormData')
    const response = new Response(body.value, { status: source.status, headers: toFetchHeaders(source.headers) })
    void response.headers.get('content-type')
    return writeFetchResponse(response, target)
  }

  target.code(source.status)
  writeAdapterHeaders(source.headers, target)
  switch (body.kind) {
    case 'empty':
      return target.send()
    case 'json':
      if (body.value === undefined) throw new TypeError('JSON response body cannot encode to undefined')
      return target.send(body.value)
    case 'text':
      if (typeof body.value !== 'string') throw new TypeError('Text response body must be a string')
      return target.send(body.value)
    case 'bytes':
      if (!(body.value instanceof Uint8Array)) throw new TypeError('Byte response body must be Uint8Array')
      return target.send(Buffer.from(body.value.buffer, body.value.byteOffset, body.value.byteLength))
    case 'stream':
      return target.send(readableStream(body.value))
  }
}

function createRouteHandler(
  route: AdapterRoute,
  includeNativeContext: boolean,
  includeHostContext: boolean
): FastifyHandler {
  return async (request, reply) => {
    const lifetime = nodeRequestLifetime(request.raw, reply.raw)
    let headers: Readonly<Record<string, string>> | undefined
    const body: AdapterBody | undefined = request.body === undefined ? undefined : { value: request.body }
    const nativeContext: FastifyAdapterContext = { request, reply }
    const input: AdapterRouteInput = {
      request,
      signal: lifetime.signal,
      ...(includeNativeContext ? { contextInput: nativeContext } : {}),
      ...(includeHostContext ? { hostContext: nativeContext } : {}),
      params: request.params as Readonly<Record<string, string>>,
      query: request.query as Readonly<Record<string, unknown>>,
      readHeaders: () => (headers ??= requestHeaders(request)),
      readBody: (representation) => missingBodyParser(representation),
      ...(body === undefined ? {} : { body }),
    }
    return writeAdapterResponse(await route.execute(input), reply)
  }
}

function mountFastify<
  const App extends FastifyInstance,
  const ContractType extends Contract,
  const Context extends object,
>(
  app: App,
  implementation: ServerExecutableFor<ContractType, Context, 'fastify', FastifyAdapterContext>,
  options: FastifyServerOptions
): App {
  assertAdapterContext(implementation.context, 'fastify')
  const includeNativeContext = serverContextAdapterId(implementation.context) !== undefined
  const runtime = createAdapterRuntime(
    implementation,
    options.onError === undefined
      ? {}
      : {
          onError: ({ hostContext, ...input }) =>
            options.onError?.({ ...input, ...(hostContext as FastifyAdapterContext) }),
        }
  )
  for (const route of runtime.routes) {
    app.route({
      method: route.method,
      url: route.path,
      handler: createRouteHandler(route, includeNativeContext, options.onError !== undefined),
    })
  }
  return app
}

/** Creates a Fastify adapter bound to one caller-owned application. */
export function fastifyAdapter<const App extends FastifyInstance>(
  app: App,
  defaults: FastifyServerOptions = {}
): FastifyAdapter<App> {
  const configuredDefaults = { ...defaults }
  return createServerAdapter('fastify', {
    mount: <const ContractType extends Contract, const Context extends object>(
      implementation: ServerExecutableFor<ContractType, Context, 'fastify', FastifyAdapterContext>,
      options?: FastifyServerOptions
    ) =>
      mountFastify(
        app,
        implementation,
        options === undefined ? configuredDefaults : { ...configuredDefaults, ...options }
      ),
  }) as unknown as FastifyAdapter<App>
}
