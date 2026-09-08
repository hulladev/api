import type { Contract } from '@hulla/api'
import { nodeRequestHeader, nodeRequestHeaders, nodeRequestLifetime, writeNodeResponse } from '@hulla/api-node'
import {
  createAdapterRuntime,
  errorResponse,
  type AdapterBody,
  type AdapterErrorInput,
  type AdapterResponse,
  type AdapterRoute,
  type AdapterRouteInput,
  type AdapterRuntimeOptions,
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

export type ExpressServerErrorInput<Locals extends Record<string, unknown> = Record<string, unknown>> = Omit<
  AdapterErrorInput,
  'hostContext' | 'request'
> &
  ExpressAdapterContext<Locals>

export type ExpressServerOptions<Locals extends Record<string, unknown> = Record<string, unknown>> = Omit<
  AdapterRuntimeOptions,
  'onError'
> & {
  readonly onError?:
    | ((input: ExpressServerErrorInput<Locals>) => Awaitable<AdapterResponse | undefined | void>)
    | undefined
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

export type ExpressAdapter<Locals extends Record<string, unknown> = Record<string, unknown>> = ServerAdapter<
  'express',
  ExpressAdapterContext<Locals>
> & {
  readonly mount: <const ContractType extends Contract, const Context extends object>(
    implementation: ServerExecutableFor<ContractType, Context, 'express', ExpressAdapterContext<Locals>>,
    options?: ExpressServerOptions<Locals>
  ) => ExpressRouter
}

type ExpressRouteHandler = Pick<AdapterRoute, 'key' | 'method' | 'path'> & {
  readonly handler: ExpressHandler
}

const handlerCache = new WeakMap<object, readonly ExpressRouteHandler[]>()

export type ExpressContextInput<
  ContractType extends Contract = Contract,
  Locals extends Record<string, unknown> = Record<string, unknown>,
> = ServerContextInput<ContractType> & ExpressAdapterContext<Locals>

type HeaderInput = AdapterRouteInput & {
  readonly request: ExpressRequest
  cachedHeaders?: Readonly<Record<string, string>>
}

function readHeaders(this: HeaderInput): Readonly<Record<string, string>> {
  return (this.cachedHeaders ??= nodeRequestHeaders(this.request.headers))
}

function readHeader(this: HeaderInput, name: string): string | undefined {
  return this.cachedHeaders === undefined ? nodeRequestHeader(this.request.headers, name) : this.cachedHeaders[name]
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
      `Express request body is unavailable; install matching Express parser middleware before mount() for ${representation} bodies`
    )
  )
}

function createEndpointHandler(
  route: AdapterRoute,
  includeNativeContext: boolean,
  includeHostContext: boolean,
  onError?: ExpressServerOptions['onError']
): ExpressHandler {
  return async (request, response, next) => {
    const lifetime =
      typeof request.once === 'function' && typeof response.once === 'function'
        ? nodeRequestLifetime(request, response)
        : undefined
    try {
      const parsedBody: AdapterBody | undefined = request.body === undefined ? undefined : { value: request.body }
      const nativeContext =
        includeNativeContext || includeHostContext
          ? {
              request,
              response,
              locals: response.locals as Readonly<Record<string, unknown>>,
            }
          : undefined
      const input: HeaderInput = {
        request,
        ...(lifetime === undefined ? {} : { signal: lifetime.signal }),
        ...(includeNativeContext ? { contextInput: nativeContext! } : {}),
        ...(includeHostContext ? { hostContext: nativeContext } : {}),
        params: request.params as Readonly<Record<string, string>>,
        query: requestQuery(request),
        readHeaders,
        readHeader,
        readBody: (representation) => missingBodyParser(representation),
        ...(parsedBody === undefined ? {} : { body: parsedBody }),
      }
      const result = await route.execute(input)
      await writeNodeResponse(result, response, request.method.toUpperCase())
    } catch (error) {
      const fallback = errorResponse(error, 'transport')
      let replacement: AdapterResponse | undefined | void
      try {
        replacement = await onError?.({
          error,
          phase: 'transport',
          request,
          response,
          locals: response.locals,
          defaultResponse: fallback,
        })
      } catch {
        /* Preserve the transport failure. */
      }
      if (response.headersSent) {
        response.destroy()
        return
      }
      try {
        for (const name of response.getHeaderNames()) response.removeHeader(name)
        await writeNodeResponse(replacement ?? fallback, response, request.method.toUpperCase())
      } catch (failure) {
        next(failure)
      }
    } finally {
      lifetime?.dispose()
    }
  }
}

function createHandlers<
  const ContractType extends Contract,
  const Context extends object,
  Locals extends Record<string, unknown>,
>(
  implementation: ServerExecutableFor<ContractType, Context, 'express', ExpressAdapterContext<Locals>>,
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
  const includeNativeContext = serverContextAdapterId(implementation.context) !== undefined
  const handlers = runtime.routes.map((route) => ({
    key: route.key,
    method: route.method,
    path: route.path,
    handler: createEndpointHandler(
      route,
      includeNativeContext,
      options.onError !== undefined,
      options.onError as ExpressServerOptions['onError']
    ),
  }))
  if (options.onError === undefined) handlerCache.set(implementation, handlers)
  return handlers
}

function mountExpress<
  const Router extends ExpressRouter,
  const ContractType extends Contract,
  const Context extends object,
  Locals extends Record<string, unknown> = Record<string, unknown>,
>(
  router: Router,
  implementation: ServerExecutableFor<ContractType, Context, 'express', ExpressAdapterContext<Locals>>,
  options: ExpressServerOptions<Locals> = {}
): Router {
  assertAdapterContext(implementation.context, 'express')
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

/** Creates an Express adapter bound to one caller-owned app or Router. */
export function expressAdapter<Locals extends Record<string, unknown> = Record<string, unknown>>(
  router: ExpressRouter,
  defaults: ExpressServerOptions<Locals> = {}
): ExpressAdapter<Locals> {
  const configuredDefaults = { ...defaults }
  return createServerAdapter('express', {
    mount: <const ContractType extends Contract, const Context extends object>(
      implementation: ServerExecutableFor<ContractType, Context, 'express', ExpressAdapterContext<Locals>>,
      options?: ExpressServerOptions<Locals>
    ) =>
      mountExpress(
        router,
        implementation,
        options === undefined ? configuredDefaults : { ...configuredDefaults, ...options }
      ),
  }) as unknown as ExpressAdapter<Locals>
}
