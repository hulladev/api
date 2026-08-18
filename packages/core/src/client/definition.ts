import type { CompiledContractRoute } from '../compiler'
import type { ContextFrom } from '../context'
import type { Contract } from '../contract'
import { isPromiseLike } from '../execution'
import { assertMiddleware, assertMiddlewares, dispatchMiddlewares } from '../middleware'
import { hasOwn, isRecord, setOwn } from '../object'
import {
  type APIClientPluginList,
  type APIClientPluginRouteCall,
  type APIClientPluginRouteKey,
  type APIPlugin,
} from '../plugin'
import { normalizeAPIPlugins } from '../plugin-runtime'
import { compileCanonicalContract } from '../route-plan'
import type { ClientContextInput, ClientContractRouteMetadata } from './context'
import type { ClientMiddleware, ClientMiddlewareCandidate, ClientMiddlewareInput } from './middleware'
import {
  assertClientBaseUrl,
  compileClientRequest,
  type ClientRequestOptions,
  type ClientRequestCreator,
  type ClientTransportOptions,
} from './request'
import {
  ClientResponseError,
  compileClientResponse,
  createClientResponse,
  type ClientResponseDecoder,
} from './response'
import type { ClientDefinition, ClientRoutes, DefineClientOptions } from './types'

type EmptyClientContext = Record<string, never>
type ContextFactoryShape<ContractType extends Contract> = (
  input: ClientContextInput<ContractType>
) => object | PromiseLike<object>

const emptyContext = Object.freeze({}) as EmptyClientContext

type RuntimeRoute = {
  readonly compiled: CompiledContractRoute
  readonly createRequest: ClientRequestCreator
  readonly metadata: ClientContractRouteMetadata
  readonly responseDecoder?: ClientResponseDecoder
  readonly responseStatus?: number
  readonly responses?: ReadonlyMap<number, ClientResponseDecoder>
}

function responseDecoder(runtime: RuntimeRoute, response: Response): ClientResponseDecoder {
  const decoder =
    runtime.responseStatus === response.status ? runtime.responseDecoder : runtime.responses?.get(response.status)
  if (decoder !== undefined) return decoder
  const route = runtime.compiled.route
  throw new ClientResponseError(
    'unexpected-status',
    response,
    `Response status ${response.status} is not declared for ${route.method} ${route.path}`
  )
}

async function executeRoute(
  runtime: RuntimeRoute,
  transport: ClientTransportOptions,
  contextFactory: ((input: ClientContextInput) => object | PromiseLike<object>) | undefined,
  middlewares: readonly ClientMiddleware<object, Contract>[],
  input: Readonly<Record<string, unknown>>,
  options: ClientRequestOptions
): Promise<unknown> {
  const requestStep = runtime.createRequest(input, options)
  const request = isPromiseLike(requestStep) ? await requestStep : requestStep
  const context =
    contextFactory === undefined ? emptyContext : await contextFactory({ request, route: runtime.metadata })
  if (!isRecord(context)) throw new TypeError('Client context factory must return an object')
  const fetcher = transport.fetch ?? globalThis.fetch
  const fetchAndDecode = async () => {
    const response = await fetcher(request)
    return responseDecoder(runtime, response)(response)
  }

  if (middlewares.length === 0) return fetchAndDecode()

  const middlewareInput = { context, request, response: createClientResponse, route: runtime.metadata }

  return dispatchMiddlewares<ClientMiddlewareInput<object, Contract>, unknown>(
    middlewares,
    middlewareInput,
    fetchAndDecode,
    {
      invalidMiddleware: () => new TypeError('Client middleware must be a function'),
      multipleNext: () => new TypeError('Client middleware called next() more than once'),
    }
  )
}

function setClientRoute(target: Record<string, unknown>, key: readonly string[], value: unknown): void {
  if (key.length === 1) {
    setOwn(target, key[0]!, value)
    return
  }

  let parent = target

  for (const segment of key.slice(0, -1)) {
    const existing = hasOwn(parent, segment) ? parent[segment] : undefined
    if (existing !== undefined) {
      if (!isRecord(existing)) throw new TypeError(`Compiled client key "${key.join('.')}" collides with a route`)
      parent = existing as Record<string, unknown>
      continue
    }

    const nested: Record<string, unknown> = {}
    setOwn(parent, segment, nested)
    parent = nested
  }

  const routeKey = key.at(-1)
  if (routeKey === undefined) throw new TypeError('Compiled client route key must not be empty')
  setOwn(parent, routeKey, value)
}

function clientRouteKey(key: readonly string[]): APIClientPluginRouteKey {
  const root = key.join('/')
  return Object.freeze({
    root,
    full: (...args: readonly unknown[]) => [root, ...args] as readonly [string, ...unknown[]],
  })
}

function attachClientPluginMembers(
  call: APIClientPluginRouteCall,
  plugin: APIPlugin,
  members: Readonly<Record<string, unknown>>
): void {
  const namespace = `$${plugin.namespace ?? plugin.id}`
  if (hasOwn(call, namespace)) throw new TypeError(`Client plugin "${plugin.id}" collides on namespace "${namespace}"`)

  const extension = Object.create(null) as Record<string, unknown>
  for (const [key, value] of Object.entries(members)) setOwn(extension, key, value)
  Object.freeze(extension)
  Object.defineProperty(call, namespace, { enumerable: true, value: extension })
}

function applyClientPlugins(
  contract: Contract,
  plan: ReturnType<typeof compileCanonicalContract>['routes'][number],
  call: APIClientPluginRouteCall,
  plugins: readonly APIPlugin[]
): void {
  const key = clientRouteKey(plan.compiled.key)
  if (plugins.some((plugin) => plugin.routeKeys === true)) {
    Object.defineProperty(call, '$key', { enumerable: true, value: key })
  }

  for (const plugin of plugins) {
    const hook = plugin.client?.route
    if (hook === undefined) continue
    const members = hook({ contract, route: plan.compiled, call, hasInput: plan.hasInput, key })
    if (members === undefined) continue
    if (!isRecord(members)) throw new TypeError(`Client plugin "${plugin.id}" route hook must return an object`)
    attachClientPluginMembers(call, plugin, members)
  }
}

function buildClientRoutes(
  contract: Contract,
  transport: ClientTransportOptions,
  contextFactory: ((input: ClientContextInput) => object | PromiseLike<object>) | undefined,
  middlewares: readonly ClientMiddleware<object, Contract>[],
  plugins: readonly APIPlugin[]
): Readonly<Record<string, unknown>> {
  const tree: Record<string, unknown> = {}
  const contractPlan = compileCanonicalContract(contract)
  let errorResponses: ReadonlyMap<number, ClientResponseDecoder> | undefined
  if (contractPlan.errors.length > 0) {
    const decoders = new Map<number, ClientResponseDecoder>()
    for (const [status, response] of contractPlan.errors) decoders.set(status, compileClientResponse(response))
    errorResponses = decoders
  }

  for (const plan of contractPlan.routes) {
    const compiled = plan.compiled
    const responseEntries = plan.responses
    let responseStatus: number | undefined
    let responseDecoder: ClientResponseDecoder | undefined
    let responses: ReadonlyMap<number, ClientResponseDecoder> | undefined
    if (errorResponses === undefined && responseEntries.length === 1) {
      const [status, response] = responseEntries[0]!
      responseStatus = status
      responseDecoder = compileClientResponse(response)
    } else {
      const responseMap = new Map(errorResponses)
      for (const [status, response] of responseEntries) {
        responseMap.set(status, compileClientResponse(response))
      }
      responses = responseMap
    }
    const runtime: RuntimeRoute = {
      compiled,
      createRequest: compileClientRequest(plan, transport),
      metadata: plan.metadata as ClientContractRouteMetadata,
      ...(responses === undefined
        ? { responseDecoder: responseDecoder!, responseStatus: responseStatus! }
        : { responses }),
    }

    const call = ((...args: readonly unknown[]) => {
      const input = (plan.hasInput ? args[0] : {}) as Readonly<Record<string, unknown>>
      const requestOptions = (plan.hasInput ? args[1] : args[0]) as ClientRequestOptions | undefined
      return executeRoute(runtime, transport, contextFactory, middlewares, input, requestOptions ?? {})
    }) as APIClientPluginRouteCall
    applyClientPlugins(contract, plan, call, plugins)
    setClientRoute(tree, compiled.key, call)
  }

  for (const plugin of plugins) plugin.client?.build?.({ contract, routes: tree })

  return tree
}

function createDefinition<ContractType extends Contract, Context extends object, Plugins extends APIClientPluginList>(
  contract: ContractType,
  options: DefineClientOptions<Context, ContractType, Plugins>,
  plugins: Plugins,
  middlewares: readonly ClientMiddleware<Context, ContractType>[] = []
): ClientDefinition<ContractType, Context, Plugins> {
  assertClientBaseUrl(options.baseUrl)
  const middlewareStack = [...middlewares]
  const transport = {
    ...(options.baseUrl === undefined ? {} : { baseUrl: options.baseUrl }),
    ...(options.fetch === undefined ? {} : { fetch: options.fetch }),
    ...(options.headers === undefined ? {} : { headers: options.headers }),
  }

  const middleware = (<const Handler extends ClientMiddlewareCandidate<Context, ContractType>>(handler: Handler) => {
    assertMiddleware('Client', handler)
    return handler
  }) as ClientDefinition<ContractType, Context, Plugins>['middleware']

  const use = (<const Middlewares extends readonly ClientMiddlewareCandidate<Context, ContractType>[]>(
    ...applied: Middlewares
  ) => {
    assertMiddlewares('Client', applied)

    return createDefinition(contract, options, plugins, [
      ...middlewareStack,
      ...(applied as readonly ClientMiddleware<Context, ContractType>[]),
    ])
  }) as ClientDefinition<ContractType, Context, Plugins>['use']

  let builtClient: ClientRoutes<ContractType, ContractType['routes'], undefined, Plugins> | undefined
  const build = (() => {
    builtClient ??= buildClientRoutes(
      contract,
      transport,
      options.context as ((input: ClientContextInput) => object | PromiseLike<object>) | undefined,
      middlewareStack as unknown as readonly ClientMiddleware<object, Contract>[],
      plugins
    ) as ClientRoutes<ContractType, ContractType['routes'], undefined, Plugins>
    return builtClient
  }) as ClientDefinition<ContractType, Context, Plugins>['build']

  return {
    contract,
    context: options.context,
    middlewares: middlewareStack,
    plugins,
    middleware,
    use,
    build,
  }
}

export function defineClient<
  const ContractType extends Contract,
  const Factory extends ContextFactoryShape<ContractType>,
  const Plugins extends APIClientPluginList = readonly [],
>(
  contract: ContractType,
  options: ClientTransportOptions & { readonly context: Factory; readonly plugins?: Plugins }
): ClientDefinition<ContractType, ContextFrom<Factory>, Plugins>

export function defineClient<
  const ContractType extends Contract,
  const Plugins extends APIClientPluginList = readonly [],
>(
  contract: ContractType,
  options?: DefineClientOptions<EmptyClientContext, NoInfer<ContractType>, Plugins> & {
    readonly context?: undefined
  }
): ClientDefinition<ContractType, EmptyClientContext, Plugins>

export function defineClient(
  contract: Contract,
  options: DefineClientOptions<object, Contract, APIClientPluginList> = {}
): unknown {
  const plugins = normalizeAPIPlugins(options.plugins, 'client') as APIClientPluginList
  return createDefinition(contract, options, plugins)
}
