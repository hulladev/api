import 'reflect-metadata'
import type { IncomingHttpHeaders, IncomingMessage, ServerResponse } from 'node:http'
import { Readable } from 'node:stream'
import { compileContract, type CompiledContractRoute, type Contract } from '@hulla/api'
import {
  createAdapterRuntime,
  errorResponse,
  toFetchResponse,
  type AdapterErrorInput,
  type AdapterResponse,
  type AdapterRoute,
  type AdapterRuntime,
} from '@hulla/api/adapters'
import { nodeRequestLifetime } from '@hulla/api/adapters/node'
import {
  assertAdapterContext,
  createServerAdapter,
  type Awaitable,
  type ServerAdapter,
  type ServerContextInput,
  type ServerExecutableFor,
} from '@hulla/api/server'
import {
  Controller,
  Inject,
  Module,
  Req,
  Res,
  RequestMapping,
  RequestMethod,
  StreamableFile,
  type DynamicModule,
  type InjectionToken,
  type ModuleMetadata,
  type Provider,
  type Scope,
  type Type,
} from '@nestjs/common'
import { HttpAdapterHost } from '@nestjs/core'

/** Common Express/Fastify request fields. Pass native request/response types to nestAdapter for host-specific fields. */
export type NestRequest = {
  readonly method: string
  readonly url: string
  readonly headers: IncomingHttpHeaders
  readonly params?: Readonly<Record<string, string>>
  readonly body?: unknown
  readonly raw?: IncomingMessage
}
export type NestAdapterContext<Request extends NestRequest = NestRequest, Response = unknown> = {
  readonly request: Request
  readonly response: Response
}
export type NestContextInput<
  ContractType extends Contract = Contract,
  Request extends NestRequest = NestRequest,
  Response = unknown,
> = ServerContextInput<ContractType> & NestAdapterContext<Request, Response>
export type NestServerErrorInput<Request extends NestRequest = NestRequest, Response = unknown> = Omit<
  AdapterErrorInput,
  'request' | 'hostContext'
> &
  NestAdapterContext<Request, Response>
export type NestServerOptions<Request extends NestRequest = NestRequest, Response = unknown> = {
  readonly onError?: (input: NestServerErrorInput<Request, Response>) => Awaitable<AdapterResponse | undefined | void>
  readonly controllerDecorators?: readonly ClassDecorator[]
  readonly routeDecorators?: (
    route: Pick<CompiledContractRoute, 'key' | 'method' | 'path'>
  ) => readonly MethodDecorator[]
}
export type NestFactoryOptions<
  ContractType extends Contract,
  Context extends object,
  Dependencies extends unknown[],
  Request extends NestRequest,
  Response,
> = NestServerOptions<Request, Response> & {
  readonly imports?: ModuleMetadata['imports']
  readonly providers?: Provider[]
  readonly inject: { readonly [Key in keyof Dependencies]: InjectionToken<Dependencies[Key]> }
  readonly useFactory: (
    ...dependencies: Dependencies
  ) => Awaitable<ServerExecutableFor<ContractType, Context, 'nestjs', NestAdapterContext<Request, Response>>>
  readonly scope?: Scope
}
export type NestAdapter<Request extends NestRequest = NestRequest, Response = unknown> = ServerAdapter<
  'nestjs',
  NestAdapterContext<Request, Response>
> & {
  /** Returns a native controller for the application's @Module({ controllers: [...] }). Supports fragments. */
  readonly mount: <const ContractType extends Contract, const Context extends object>(
    implementation: ServerExecutableFor<ContractType, Context, 'nestjs', NestAdapterContext<Request, Response>>,
    options?: NestServerOptions<Request, Response>
  ) => Type<object>
  /** Creates an injectable implementation provider and native controller, including request-scoped dependencies. */
  readonly register: <
    const ContractType extends Contract,
    const Context extends object,
    Dependencies extends unknown[],
  >(
    contract: ContractType,
    options: NestFactoryOptions<ContractType, Context, Dependencies, Request, Response>
  ) => DynamicModule
}

type NativeContext = NestAdapterContext
type RouteMetadata = Pick<CompiledContractRoute, 'key' | 'method' | 'path'>
const routeKey = (route: RouteMetadata) => JSON.stringify(route.key)

function runtime<const ContractType extends Contract, const Context extends object>(
  implementation: ServerExecutableFor<ContractType, Context, 'nestjs', NativeContext>,
  options: NestServerOptions
): AdapterRuntime {
  assertAdapterContext(implementation.context, 'nestjs')
  return createAdapterRuntime(
    implementation,
    options.onError === undefined
      ? {}
      : { onError: ({ hostContext, ...input }) => options.onError!({ ...input, ...(hostContext as NativeContext) }) }
  )
}

function nodeResponse(response: unknown): ServerResponse {
  return ((response as { raw?: ServerResponse }).raw ?? response) as ServerResponse
}

function readable(
  source: AsyncIterable<Uint8Array> | Iterable<Uint8Array>,
  response: ServerResponse,
  onError: (error: unknown) => void
): Readable {
  const stream = Readable.from(source, { objectMode: false })
  const disconnected = () => stream.destroy()
  response.once('close', disconnected)
  stream.once('close', () => response.off('close', disconnected))
  stream.once('error', (error) => {
    onError(error)
    // A committed stream must fail visibly, rather than ending a truncated successful response.
    response.destroy()
  })
  return stream
}

async function output(
  result: AdapterResponse,
  host: HttpAdapterHost,
  request: NestRequest,
  response: unknown,
  observe: (error: unknown) => void
): Promise<unknown> {
  const native = host.httpAdapter
  let body = result.body
  let headers = result.headers
  if (body.kind === 'raw' || body.kind === 'form-data') {
    const web = toFetchResponse(result)
    const values: Record<string, string | readonly string[]> = Object.fromEntries(web.headers)
    const cookies = web.headers.getSetCookie()
    if (cookies.length > 0) values['set-cookie'] = cookies
    headers = values
    body =
      web.body === null
        ? { kind: 'empty', value: undefined }
        : {
            kind: 'stream',
            value: (async function* () {
              const reader = web.body!.getReader()
              try {
                while (true) {
                  const item = await reader.read()
                  if (item.done) return
                  yield item.value
                }
              } finally {
                await reader.cancel().catch(() => {})
                reader.releaseLock()
              }
            })(),
          }
    if (request.method === 'HEAD') await web.body?.cancel()
  }
  native.status(response, result.status)
  for (const [name, value] of Object.entries(headers)) {
    if (typeof value === 'string') native.setHeader(response, name, value)
    else for (const field of value) native.appendHeader(response, name, field)
  }
  if (request.method === 'HEAD') {
    if (body.kind === 'stream') await (body.value as AsyncIterable<Uint8Array>)[Symbol.asyncIterator]().return?.()
    return undefined
  }
  if (body.kind === 'empty') return undefined
  if (body.kind === 'stream') {
    const type = headers['content-type']
    return new StreamableFile(
      readable(body.value as AsyncIterable<Uint8Array>, nodeResponse(response), observe),
      typeof type === 'string' ? { type } : {}
    )
  }
  if (body.kind === 'bytes') return new StreamableFile(body.value as Uint8Array)
  return body.value
}

function controller(
  routes: readonly RouteMetadata[],
  options: NestServerOptions,
  configured?: AdapterRuntime,
  token?: symbol
): Type<object> {
  for (const route of routes) {
    if (route.method === 'QUERY')
      throw new TypeError('NestJS integration does not support QUERY routes across its supported host versions')
  }
  class ContractController {
    readonly routes: ReadonlyMap<string, AdapterRoute>
    constructor(
      readonly host: HttpAdapterHost,
      injected?: AdapterRuntime
    ) {
      if (!['express', 'fastify'].includes(host.httpAdapter.getType()))
        throw new TypeError('NestJS integration requires the Express or Fastify platform adapter')
      const runtime = injected ?? configured!
      this.routes = new Map(runtime.routes.map((route) => [routeKey(route), route]))
      if (this.routes.size !== routes.length || routes.some((route) => !this.routes.has(routeKey(route))))
        throw new TypeError('NestJS factory must implement every registered contract route')
    }
  }
  Controller()(ContractController)
  Inject(HttpAdapterHost)(ContractController, undefined, 0)
  if (token) Inject(token)(ContractController, undefined, 1)
  for (const [index, route] of routes.entries()) {
    const name = `operation${index}`
    Object.defineProperty(ContractController.prototype, name, {
      configurable: true,
      value: async function (this: ContractController, request: NestRequest, response: unknown) {
        const raw = request.raw ?? (request as unknown as IncomingMessage)
        const lifetime = nodeRequestLifetime(raw, nodeResponse(response))
        const nativeContext = { request, response }
        const headers: Record<string, string> = {}
        for (const [name, value] of Object.entries(request.headers)) {
          if (value !== undefined) headers[name] = typeof value === 'string' ? value : value.join(', ')
        }
        const query = request.url.indexOf('?')
        const result = await this.routes.get(routeKey(route))!.execute({
          request,
          signal: lifetime.signal,
          contextInput: nativeContext,
          hostContext: nativeContext,
          params: request.params ?? {},
          headers,
          ...(query < 0 ? {} : { query: new URLSearchParams(request.url.slice(query + 1)) }),
          ...(request.body === undefined ? {} : { body: { value: request.body } }),
          readBody: async () => {
            throw new TypeError('NestJS body is unavailable; configure the matching host parser before mounting')
          },
        })
        return output(result, this.host, request, response, (error) => {
          void Promise.resolve()
            .then(() =>
              options.onError?.({
                ...nativeContext,
                error,
                phase: 'transport',
                route,
                defaultResponse: errorResponse(error, 'transport'),
              })
            )
            .catch(() => {})
        })
      },
    })
    const descriptor = Object.getOwnPropertyDescriptor(ContractController.prototype, name)!
    RequestMapping({ path: route.path, method: RequestMethod[route.method as keyof typeof RequestMethod] })(
      ContractController.prototype,
      name,
      descriptor
    )
    Req()(ContractController.prototype, name, 0)
    Res({ passthrough: true })(ContractController.prototype, name, 1)
    for (const decorate of options.routeDecorators?.(route) ?? [])
      decorate(ContractController.prototype, name, descriptor)
  }
  for (const decorate of options.controllerDecorators ?? []) decorate(ContractController)
  return ContractController
}

export function nestAdapter<Request extends NestRequest = NestRequest, Response = unknown>(
  defaults: NestServerOptions<Request, Response> = {}
): NestAdapter<Request, Response> {
  const configured = { ...defaults }
  return createServerAdapter('nestjs', {
    mount: (
      implementation: ServerExecutableFor<Contract, object, 'nestjs', NativeContext>,
      options?: NestServerOptions
    ) => {
      const merged = { ...configured, ...options } as unknown as NestServerOptions
      const compiled = runtime(implementation, merged)
      return controller(compiled.routes, merged, compiled)
    },
    register: (
      contract: Contract,
      options: NestFactoryOptions<Contract, object, unknown[], NestRequest, unknown>
    ): DynamicModule => {
      const merged = { ...configured, ...options } as unknown as NestServerOptions
      const token = Symbol('contract runtime')
      const generated = controller(compileContract(contract).routes, merged, undefined, token)
      class ContractModule {}
      Module({})(ContractModule)
      return {
        module: ContractModule,
        controllers: [generated],
        imports: options.imports ?? [],
        providers: [
          ...(options.providers ?? []),
          {
            provide: token,
            inject: [...options.inject],
            ...(options.scope === undefined ? {} : { scope: options.scope }),
            useFactory: async (...dependencies: unknown[]) => {
              const implementation = await options.useFactory(...dependencies)
              if (implementation.contract !== contract)
                throw new TypeError('NestJS implementation factory returned a different contract')
              return runtime(implementation, merged)
            },
          },
        ],
      }
    },
  }) as unknown as NestAdapter<Request, Response>
}
