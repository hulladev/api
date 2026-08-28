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
  Context as NativeHonoContext,
  Env as HonoEnv,
  Handler as NativeHonoHandler,
  Hono,
  Schema as HonoSchema,
} from 'hono'
import { cloneRawRequest } from 'hono/request'

type HonoAdapterContext<Env extends HonoEnv> = {
  readonly request: Request
  readonly honoContext: NativeHonoContext<Env>
}

export type HonoContext<Env extends HonoEnv = HonoEnv> = NativeHonoContext<Env>
export type HonoHandler<Env extends HonoEnv = HonoEnv> = NativeHonoHandler<Env>

export type HonoContextInput<
  ContractType extends Contract = Contract,
  Env extends HonoEnv = HonoEnv,
> = ServerContextInput<ContractType> & HonoAdapterContext<Env>

export type HonoServerErrorInput<Env extends HonoEnv = HonoEnv> = Omit<
  AdapterErrorInput,
  'defaultResponse' | 'hostContext' | 'request'
> &
  HonoAdapterContext<Env> & {
    readonly defaultResponse: Response
  }

export type HonoServerOptions<Env extends HonoEnv = HonoEnv> = {
  readonly onError?: ((input: HonoServerErrorInput<Env>) => Awaitable<Response | undefined | void>) | undefined
}

export type HonoAdapter<
  Env extends HonoEnv = HonoEnv,
  AppSchema extends HonoSchema = HonoSchema,
  BasePath extends string = string,
> = ServerAdapter<'hono', HonoAdapterContext<Env>> & {
  readonly mount: <const ContractType extends Contract, const Context extends object>(
    implementation: ServerExecutableFor<ContractType, Context, 'hono', HonoAdapterContext<Env>>,
    options?: HonoServerOptions<Env>
  ) => Hono<Env, AppSchema, BasePath>
}

function requestQuery(url: string): URLSearchParams | undefined {
  const start = url.indexOf('?')
  if (start === -1) return undefined
  const hash = url.indexOf('#', start + 1)
  return new URLSearchParams(url.slice(start + 1, hash === -1 ? undefined : hash))
}

async function readBody(
  context: NativeHonoContext,
  representation: string,
  preserveRequest: boolean
): Promise<unknown> {
  if (preserveRequest) {
    const request = await cloneRawRequest(context.req)
    switch (representation) {
      case 'json':
        return request.json()
      case 'text':
        return request.text()
      case 'bytes':
        return new Uint8Array(await request.arrayBuffer())
      case 'form-data':
        return request.formData()
      default:
        throw new TypeError(`Unsupported Hono request body representation ${representation}`)
    }
  }

  switch (representation) {
    case 'json':
      return context.req.json()
    case 'text':
      return context.req.text()
    case 'bytes':
      return new Uint8Array(await context.req.arrayBuffer())
    case 'form-data':
      return context.req.formData()
    default:
      throw new TypeError(`Unsupported Hono request body representation ${representation}`)
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

function createRouteHandler<Env extends HonoEnv>(
  route: AdapterRoute,
  usesNativeContext: boolean,
  includeHostContext: boolean
): HonoHandler<Env> {
  return async (honoContext) => {
    const request = honoContext.req.raw
    const query = requestQuery(request.url)
    const nativeContext = { request, honoContext }
    const input: AdapterRouteInput = {
      request,
      ...(usesNativeContext ? { contextInput: nativeContext } : {}),
      params: honoContext.req.param(),
      ...(query === undefined ? {} : { query }),
      readHeaders: () => honoContext.req.header(),
      readBody: (representation, preserveRequest) => readBody(honoContext, representation, preserveRequest),
      ...(includeHostContext ? { hostContext: honoContext } : {}),
    }
    return toResponse(await route.execute(input))
  }
}

function createRouteHandlers<const ContractType extends Contract, const Context extends object, Env extends HonoEnv>(
  implementation: ServerExecutableFor<ContractType, Context, 'hono', HonoAdapterContext<Env>>,
  options: HonoServerOptions<Env>
): readonly (Pick<AdapterRoute, 'method' | 'path'> & { readonly handler: HonoHandler<Env> })[] {
  assertAdapterContext(implementation.context, 'hono')
  const usesNativeContext = serverContextAdapterId(implementation.context) !== undefined
  const runtime = createAdapterRuntime(
    implementation,
    options.onError === undefined
      ? {}
      : {
          onError: async ({ hostContext, ...input }) => {
            const honoContext = hostContext as NativeHonoContext<Env>
            const replacement = await options.onError?.({
              ...input,
              request: input.request as Request,
              honoContext,
              defaultResponse: toResponse(input.defaultResponse).clone(),
            })
            return replacement instanceof Response ? replacementResponse(replacement) : undefined
          },
        }
  )
  return runtime.routes.map((route) => ({
    method: route.method,
    path: route.path,
    handler: createRouteHandler<Env>(route, usesNativeContext, options.onError !== undefined),
  }))
}

function mountHono<
  const ContractType extends Contract,
  const Context extends object,
  Env extends HonoEnv,
  AppSchema extends HonoSchema,
  BasePath extends string,
>(
  app: Hono<Env, AppSchema, BasePath>,
  implementation: ServerExecutableFor<ContractType, Context, 'hono', HonoAdapterContext<Env>>,
  options: HonoServerOptions<Env>
): Hono<Env, AppSchema, BasePath> {
  const routes = createRouteHandlers(implementation, options)
  for (const route of routes) app.on(route.method, route.path, route.handler)
  return app
}

/** Creates a Hono adapter bound to one caller-owned application. */
export function honoAdapter<
  Env extends HonoEnv = HonoEnv,
  AppSchema extends HonoSchema = HonoSchema,
  BasePath extends string = string,
>(app: Hono<Env, AppSchema, BasePath>, defaults: HonoServerOptions<Env> = {}): HonoAdapter<Env, AppSchema, BasePath> {
  const configuredDefaults = { ...defaults }
  return createServerAdapter('hono', {
    mount: <const ContractType extends Contract, const Context extends object>(
      implementation: ServerExecutableFor<ContractType, Context, 'hono', HonoAdapterContext<Env>>,
      options?: HonoServerOptions<Env>
    ) =>
      mountHono(
        app,
        implementation,
        options === undefined ? configuredDefaults : { ...configuredDefaults, ...options }
      ),
  }) as unknown as HonoAdapter<Env, AppSchema, BasePath>
}
