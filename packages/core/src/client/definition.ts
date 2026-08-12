import type { ContextFrom } from '../context'
import type { Contract, ContractRoutes } from '../contract'
import { assertMiddleware, assertMiddlewares } from '../middleware'
import { freezeRecordTree, isRecord, setOwn } from '../object'
import { joinRoutePaths } from '../paths'
import type { Route } from '../route'
import { isRouter, routerRoutes } from '../router'
import type { ClientContextInput, ClientContractRouteMetadata } from './context'
import type { ClientMiddleware, ClientMiddlewareCandidate, ClientMiddlewareNextResult } from './middleware'
import {
  compileParameterDeclaration,
  createClientRequest,
  assertClientBaseUrl,
  type ClientRequestOptions,
  type ClientTransportOptions,
  type CompiledClientRoute,
  type ParameterDeclaration,
} from './request'
import { ClientResponseError, decodeClientResponse } from './response'
import type { ClientDefinition, ClientRoutes, DefineClientOptions } from './types'

type EmptyClientContext = Record<string, never>
type ContextFactoryShape<ContractType extends Contract> = (
  input: ClientContextInput<ContractType>
) => object | PromiseLike<object>

const emptyContext = Object.freeze({}) as EmptyClientContext

type RuntimeRoute = {
  readonly compiled: CompiledClientRoute
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
  const middlewareInput = Object.freeze({ context, request, route: runtime.metadata })
  const fetcher = transport.fetch ?? globalThis.fetch

  const dispatch = async (index: number): Promise<ClientMiddlewareNextResult<unknown>> => {
    const middleware = middlewares[index]
    if (middleware === undefined) {
      const response = await fetcher(request)
      return (await decodeClientResponse(
        response,
        selectResponseDefinition(contract, runtime.compiled.route, response)
      )) as ClientMiddlewareNextResult<unknown>
    }

    return (await middleware(
      Object.freeze({ next: () => dispatch(index + 1) }),
      middlewareInput
    )) as ClientMiddlewareNextResult<unknown>
  }

  return dispatch(0)
}

function compileRoutes(
  contract: Contract,
  routes: ContractRoutes,
  transport: ClientTransportOptions,
  contextFactory: ((input: ClientContextInput) => object | PromiseLike<object>) | undefined,
  middlewares: readonly ClientMiddleware<object, Contract>[],
  pathPrefix: readonly string[] = [contract.basePath],
  keyPrefix: readonly string[] = [],
  parameters: readonly ParameterDeclaration[] = []
): Readonly<Record<string, unknown>> {
  const tree: Record<string, unknown> = {}

  for (const [key, definition] of Object.entries(routes)) {
    if (isRouter(definition)) {
      const parameter = compileParameterDeclaration(
        definition.$meta.path,
        'params' in definition.$meta ? definition.$meta.params : undefined
      )
      setOwn(
        tree,
        key,
        compileRoutes(
          contract,
          routerRoutes(definition),
          transport,
          contextFactory,
          middlewares,
          [...pathPrefix, definition.$meta.path],
          [...keyPrefix, key],
          parameter === undefined ? parameters : [...parameters, parameter]
        )
      )
      continue
    }

    const parameter = compileParameterDeclaration(
      definition.path,
      'params' in definition ? definition.params : undefined
    )
    const path = joinRoutePaths(...pathPrefix, definition.path)
    const runtime: RuntimeRoute = Object.freeze({
      compiled: Object.freeze({
        method: definition.method,
        parameters: Object.freeze(parameter === undefined ? [...parameters] : [...parameters, parameter]),
        path,
        route: definition,
      }),
      metadata: Object.freeze({
        key: Object.freeze([...keyPrefix, key]),
        method: definition.method,
        path,
      }) as ClientContractRouteMetadata,
    })

    setOwn(tree, key, (...args: readonly unknown[]) => {
      const hasInput =
        runtime.compiled.parameters.length > 0 ||
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
    builtClient ??= compileRoutes(
      contract,
      contract.routes,
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
