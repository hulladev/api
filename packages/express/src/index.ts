import type { Contract } from '@hulla/api'
import {
  createAdapterRuntime,
  type AdapterBody,
  type AdapterErrorInput,
  type AdapterResponse,
  type AdapterRoute,
  type AdapterRouteInput,
  type AdapterRuntimeOptions,
} from '@hulla/api/adapters'
import {
  assertServerAdapter,
  createServerAdapter,
  type Awaitable,
  type ServerAdapter,
  type ServerContextInput,
  type ServerExecutableFor,
} from '@hulla/api/server'
import type {
  NextFunction as NativeExpressNext,
  Request as NativeExpressRequest,
  RequestHandler as NativeExpressHandler,
  Response as NativeExpressResponse,
} from 'express'

export type ExpressRequest = NativeExpressRequest
export type ExpressResponse = NativeExpressResponse
export type ExpressNext = NativeExpressNext
export type ExpressHandler = NativeExpressHandler

type ExpressAdapterContext<Locals extends Record<string, unknown>> = {
  readonly request: ExpressRequest
  readonly response: ExpressResponse
  readonly locals: Readonly<Locals>
}

export type ExpressAdapter<Locals extends Record<string, unknown> = Record<string, unknown>> = ServerAdapter<
  'express',
  ExpressAdapterContext<Locals>
>

const expressAdapterDescriptor = /* @__PURE__ */ createServerAdapter('express') as ExpressAdapter

export function expressAdapter<
  Locals extends Record<string, unknown> = Record<string, unknown>,
>(): ExpressAdapter<Locals> {
  return expressAdapterDescriptor as ExpressAdapter<Locals>
}

export type ExpressServerErrorInput<Locals extends Record<string, unknown> = Record<string, unknown>> = Omit<
  AdapterErrorInput,
  'hostContext' | 'request'
> &
  ExpressAdapterContext<Locals>

export type ExpressServerOptions<Locals extends Record<string, unknown> = Record<string, unknown>> = Omit<
  AdapterRuntimeOptions,
  'onError'
> & {
  readonly onError?: (input: ExpressServerErrorInput<Locals>) => Awaitable<AdapterResponse | undefined | void>
}

type ExpressRouteRegistrar = (path: string, ...handlers: ExpressHandler[]) => unknown

export type ExpressRouter = {
  readonly delete: ExpressRouteRegistrar
  readonly get: ExpressRouteRegistrar
  readonly patch: ExpressRouteRegistrar
  readonly post: ExpressRouteRegistrar
  readonly put: ExpressRouteRegistrar
  readonly query?: ExpressRouteRegistrar
}

type ExpressRouteHandler = Pick<AdapterRoute, 'key' | 'method' | 'path'> & {
  readonly handler: ExpressHandler
}

const handlerCache = new WeakMap<object, readonly ExpressRouteHandler[]>()

export type ExpressContextInput<
  ContractType extends Contract = Contract,
  Locals extends Record<string, unknown> = Record<string, unknown>,
> = ServerContextInput<ContractType> & ExpressAdapterContext<Locals>

function requestHeaders(request: ExpressRequest): Readonly<Record<string, string>> {
  const headers: Record<string, string> = {}
  for (const [name, value] of Object.entries(request.headers)) {
    if (value === undefined || name.startsWith(':')) continue
    headers[name] = typeof value === 'string' ? value : value.join(', ')
  }
  return headers
}

function requestQuery(request: ExpressRequest): URLSearchParams | Readonly<Record<string, unknown>> {
  if (request.query !== undefined) return request.query as Readonly<Record<string, unknown>>
  const start = request.url.indexOf('?')
  if (start === -1) return {}
  const hash = request.url.indexOf('#', start + 1)
  return new URLSearchParams(request.url.slice(start + 1, hash === -1 ? undefined : hash))
}

function missingBodyParser(representation: string): Promise<never> {
  return Promise.reject(
    new TypeError(
      `Express request body is unavailable; install matching Express parser middleware before register() for ${representation} bodies`
    )
  )
}

function responseSetCookies(headers: Headers): readonly string[] {
  const compatible = headers as Headers & { getSetCookie?: () => readonly string[] }
  return compatible.getSetCookie?.() ?? []
}

function writeResponseHeaders(source: Headers, target: ExpressResponse): void {
  const setCookies = responseSetCookies(source)
  source.forEach((value, name) => {
    if (name !== 'set-cookie' || setCookies.length === 0) target.setHeader(name, value)
  })
  if (setCookies.length > 0) target.setHeader('set-cookie', setCookies)
}

function writeAdapterHeaders(source: Readonly<Record<string, string>>, target: ExpressResponse): void {
  for (const [name, value] of Object.entries(source)) target.setHeader(name, value)
}

function waitForDrain(response: ExpressResponse): Promise<void> {
  if (response.once === undefined) return Promise.resolve()
  return new Promise((resolve, reject) => {
    const onDrain = () => {
      cleanup()
      resolve()
    }
    const onClose = () => {
      cleanup()
      reject(new Error('Express response closed before the body finished'))
    }
    const cleanup = () => {
      response.off?.('drain', onDrain)
      response.off?.('close', onClose)
    }
    response.once?.('drain', onDrain)
    response.once?.('close', onClose)
  })
}

async function writeFetchResponse(source: Response, target: ExpressResponse, method: string): Promise<void> {
  target.status(source.status)
  writeResponseHeaders(source.headers, target)
  if (method === 'HEAD' || source.body === null) {
    target.end()
    return
  }

  const reader = source.body.getReader()
  const cancel = () => void reader.cancel(new Error('Express response closed'))
  target.once?.('close', cancel)
  try {
    while (target.writableEnded !== true) {
      const chunk = await reader.read()
      if (chunk.done) break
      if (!target.write(chunk.value)) await waitForDrain(target)
    }
    if (target.writableEnded !== true) target.end()
  } finally {
    target.off?.('close', cancel)
    reader.releaseLock()
  }
}

async function writeAdapterResponse(source: AdapterResponse, target: ExpressResponse, method: string): Promise<void> {
  const body = source.body
  if (body.kind === 'raw') {
    if (!(body.value instanceof Response) || body.value.status !== source.status) {
      throw new TypeError('Raw Fetch response status must match its declared contract status')
    }
    await writeFetchResponse(body.value, target, method)
    return
  }
  if (body.kind === 'form-data') {
    if (!(body.value instanceof FormData)) throw new TypeError('Form data response body must be FormData')
    const response = new Response(body.value, { status: source.status, headers: source.headers })
    void response.headers.get('content-type')
    await writeFetchResponse(response, target, method)
    return
  }

  target.status(source.status)
  writeAdapterHeaders(source.headers, target)
  if (method === 'HEAD' || body.kind === 'empty') {
    target.end()
    return
  }

  switch (body.kind) {
    case 'json':
      if (body.value === undefined) throw new TypeError('JSON response body cannot encode to undefined')
      target.json(body.value)
      return
    case 'text':
      if (typeof body.value !== 'string') throw new TypeError('Text response body must be a string')
      target.send(body.value)
      return
    case 'bytes':
      if (!(body.value instanceof Uint8Array)) throw new TypeError('Byte response body must be Uint8Array')
      target.send(Buffer.from(body.value.buffer, body.value.byteOffset, body.value.byteLength))
      return
    case 'stream': {
      const stream = body.value as AsyncIterable<unknown> & Iterable<unknown>
      if (typeof stream?.[Symbol.asyncIterator] !== 'function' && typeof stream?.[Symbol.iterator] !== 'function') {
        throw new TypeError('Stream response body must be iterable')
      }
      for await (const chunk of stream) {
        if (target.writableEnded === true) break
        if (!(chunk instanceof Uint8Array)) throw new TypeError('Stream chunk must be Uint8Array')
        if (!target.write(chunk)) await waitForDrain(target)
      }
      if (target.writableEnded !== true) target.end()
      return
    }
  }
}

function createEndpointHandler(route: AdapterRoute, includeHostContext: boolean): ExpressHandler {
  return async (request, response, next) => {
    try {
      let headers: Readonly<Record<string, string>> | undefined
      const parsedBody: AdapterBody | undefined = request.body === undefined ? undefined : { value: request.body }
      const nativeContext = {
        request,
        response,
        locals: response.locals as Readonly<Record<string, unknown>>,
      }
      const input: AdapterRouteInput = {
        request,
        contextInput: nativeContext,
        ...(includeHostContext ? { hostContext: nativeContext } : {}),
        params: request.params as Readonly<Record<string, string>>,
        query: requestQuery(request),
        readHeaders: () => (headers ??= requestHeaders(request)),
        readBody: (representation) => missingBodyParser(representation),
        ...(parsedBody === undefined ? {} : { body: parsedBody }),
      }
      const result = await route.execute(input)
      await writeAdapterResponse(result, response, request.method.toUpperCase())
    } catch (error) {
      next(error)
    }
  }
}

function createHandlers<
  const ContractType extends Contract,
  const Context extends object,
  Locals extends Record<string, unknown>,
>(
  implementation: ServerExecutableFor<ContractType, Context, ExpressAdapter<Locals>>,
  options: ExpressServerOptions<Locals> = {}
): readonly ExpressRouteHandler[] {
  if (options.onError === undefined) {
    const cached = handlerCache.get(implementation)
    if (cached !== undefined) return cached
  }
  const runtime = createAdapterRuntime(
    implementation,
    options.onError === undefined
      ? {}
      : {
          onError: ({ hostContext, ...input }) =>
            options.onError?.({ ...input, ...(hostContext as ExpressAdapterContext<Locals>) }),
        }
  )
  const handlers = runtime.routes.map((route) => ({
    key: route.key,
    method: route.method,
    path: route.path,
    handler: createEndpointHandler(route, options.onError !== undefined),
  }))
  if (options.onError === undefined) handlerCache.set(implementation, handlers)
  return handlers
}

/** Registers selected contract routes on a caller-owned Express app or Router. */
export function register<
  const Router extends ExpressRouter,
  const ContractType extends Contract,
  const Context extends object,
  Locals extends Record<string, unknown> = Record<string, unknown>,
>(
  router: Router,
  implementation: ServerExecutableFor<ContractType, Context, ExpressAdapter<Locals>>,
  options: ExpressServerOptions<Locals> = {}
): Router {
  assertServerAdapter(implementation.adapter, expressAdapterDescriptor)
  const endpoints = createHandlers(implementation, options)
  for (const endpoint of endpoints) {
    const method = endpoint.method.toLowerCase() as Lowercase<AdapterRoute['method']>
    const register = router[method]
    if (register === undefined) {
      throw new TypeError(`Express router does not support the ${endpoint.method} method`)
    }
    register.call(router, endpoint.path, endpoint.handler)
  }
  return router
}
