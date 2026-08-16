import { compileContract, type CompiledContractRoute } from '../compiler'
import type { ContextFrom } from '../context'
import type { Contract } from '../contract'
import { assertMiddleware, assertMiddlewares, dispatchMiddlewares } from '../middleware'
import { freezeRecordTree, hasOwn, isRecord, setOwn } from '../object'
import type { Route } from '../route'
import type { ClientContextInput, ClientContractRouteMetadata } from './context'
import type {
  ClientMiddleware,
  ClientMiddlewareActions,
  ClientMiddlewareCandidate,
  ClientMiddlewareInput,
  ClientMiddlewareNextResult,
} from './middleware'
import {
  assertClientBaseUrl,
  createClientRequest,
  type ClientRequestOptions,
  type ClientTransportOptions,
} from './request'
import { ClientResponseError, decodeClientResponse } from './response'
import type { ClientDefinition, ClientRoutes, DefineClientOptions } from './types'

type EmptyClientContext = Record<string, never>
type ContextFactoryShape<ContractType extends Contract> = (
  input: ClientContextInput<ContractType>
) => object | PromiseLike<object>

const emptyContext = Object.freeze({}) as EmptyClientContext

type RuntimeRoute = {
  readonly compiled: CompiledContractRoute
  readonly metadata: ClientContractRouteMetadata
}

function selectResponseDefinition(contract: Contract, route: Route, response: Response) {
  const routeResponse = route.responses[response.status]
  if (routeResponse !== undefined) return routeResponse

  const contractError = contract.errors[response.status]
  if (contractError !== undefined) return contractError

  throw new ClientResponseError(
    'unexpected-status',
    response,
    `Response status ${response.status} is not declared for ${route.method} ${route.path}`
  )
}

async function executeRoute(
  contract: Contract,
  runtime: RuntimeRoute,
  transport: ClientTransportOptions,
  contextFactory: ((input: ClientContextInput) => object | PromiseLike<object>) | undefined,
  middlewares: readonly ClientMiddleware<object, Contract>[],
  input: Readonly<Record<string, unknown>>,
  options: ClientRequestOptions
): Promise<unknown> {
  const request = await createClientRequest(runtime.compiled, transport, input, options)
  const context =
    contextFactory === undefined ? emptyContext : await contextFactory({ request, route: runtime.metadata })
  if (!isRecord(context)) throw new TypeError('Client context factory must return an object')
  const fetcher = transport.fetch ?? globalThis.fetch
  const fetchAndDecode = async () => {
    const response = await fetcher(request)
    return (await decodeClientResponse(
      response,
      selectResponseDefinition(contract, runtime.compiled.route, response)
    )) as ClientMiddlewareNextResult<unknown>
  }

  if (middlewares.length === 0) return fetchAndDecode()

  const middlewareInput = Object.freeze({ context, request, route: runtime.metadata })

  return dispatchMiddlewares<
    ClientMiddlewareInput<object, Contract>,
    ClientMiddlewareNextResult<unknown>,
    ClientMiddlewareActions<unknown>
  >(middlewares, middlewareInput, fetchAndDecode, (next) => ({ next }), {
    invalidMiddleware: () => new TypeError('Client middleware must be a function'),
    multipleNext: () => new TypeError('Client middleware called next() more than once'),
  })
}

function setClientRoute(target: Record<string, unknown>, key: readonly string[], value: unknown): void {
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

function buildClientRoutes(
  contract: Contract,
  transport: ClientTransportOptions,
  contextFactory: ((input: ClientContextInput) => object | PromiseLike<object>) | undefined,
  middlewares: readonly ClientMiddleware<object, Contract>[]
): Readonly<Record<string, unknown>> {
  const tree: Record<string, unknown> = {}

  for (const compiled of compileContract(contract).routes) {
    const definition = compiled.route
    const runtime: RuntimeRoute = Object.freeze({
      compiled,
      metadata: Object.freeze({
        key: compiled.key,
        method: compiled.method,
        path: compiled.path,
      }) as ClientContractRouteMetadata,
    })

    setClientRoute(tree, compiled.key, (...args: readonly unknown[]) => {
      const hasInput =
        runtime.compiled.pathParameters.length > 0 ||
        'query' in definition ||
        'headers' in definition ||
        'body' in definition
      const input = (hasInput ? args[0] : {}) as Readonly<Record<string, unknown>>
      const requestOptions = (hasInput ? args[1] : args[0]) as ClientRequestOptions | undefined
      return executeRoute(contract, runtime, transport, contextFactory, middlewares, input, requestOptions ?? {})
    })
  }

  return freezeRecordTree(tree)
}

function createDefinition<ContractType extends Contract, Context extends object>(
  contract: ContractType,
  options: DefineClientOptions<Context, ContractType>,
  middlewares: readonly ClientMiddleware<Context, ContractType>[] = []
): ClientDefinition<ContractType, Context> {
  assertClientBaseUrl(options.baseUrl)
  const frozenMiddlewares = Object.freeze([...middlewares])
  const transport = Object.freeze({
    ...(options.baseUrl === undefined ? {} : { baseUrl: options.baseUrl }),
    ...(options.fetch === undefined ? {} : { fetch: options.fetch }),
    ...(options.headers === undefined ? {} : { headers: options.headers }),
  })

  const middleware = (<const Handler extends ClientMiddlewareCandidate<Context, ContractType>>(handler: Handler) => {
    assertMiddleware('Client', handler)
    return handler
  }) as ClientDefinition<ContractType, Context>['middleware']

  const use = (<const Middlewares extends readonly ClientMiddlewareCandidate<Context, ContractType>[]>(
    ...applied: Middlewares
  ) => {
    assertMiddlewares('Client', applied)

    return createDefinition(contract, options, [
      ...frozenMiddlewares,
      ...(applied as readonly ClientMiddleware<Context, ContractType>[]),
    ])
  }) as ClientDefinition<ContractType, Context>['use']

  let builtClient: ClientRoutes<ContractType> | undefined
  const build = (() => {
    builtClient ??= buildClientRoutes(
      contract,
      transport,
      options.context as ((input: ClientContextInput) => object | PromiseLike<object>) | undefined,
      frozenMiddlewares as readonly ClientMiddleware<object, Contract>[]
    ) as ClientRoutes<ContractType>
    return builtClient
  }) as ClientDefinition<ContractType, Context>['build']

  return Object.freeze({
    contract,
    context: options.context,
    middlewares: frozenMiddlewares,
    middleware,
    use,
    build,
  })
}

export function defineClient<
  const ContractType extends Contract,
  const Factory extends ContextFactoryShape<ContractType>,
>(
  contract: ContractType,
  options: ClientTransportOptions & { readonly context: Factory }
): ClientDefinition<ContractType, ContextFrom<Factory>>

export function defineClient<const ContractType extends Contract>(
  contract: ContractType,
  options?: DefineClientOptions<EmptyClientContext, NoInfer<ContractType>> & { readonly context?: undefined }
): ClientDefinition<ContractType, EmptyClientContext>

export function defineClient(contract: Contract, options: DefineClientOptions<object, Contract> = {}): unknown {
  return createDefinition(contract, options)
}
