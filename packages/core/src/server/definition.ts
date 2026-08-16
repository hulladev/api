import { compileContract, type CompiledContractRoute } from '../compiler'
import type { ContextFrom } from '../context'
import type { Contract } from '../contract'
import { assertMiddleware, assertMiddlewares } from '../middleware'
import { freezeRecordTree, hasOwn, isRecord, setOwn } from '../object'
import type { ServerContextInput } from './context'
import { ServerImplementationError } from './errors'
import type { ServerMiddleware, ServerMiddlewareCandidate, ServerMiddlewareErrorStatuses } from './middleware'
import type { DefineServerOptions, ServerDefinition } from './types'

type EmptyServerContext = Record<string, never>
type ContextFactoryShape<ContractType extends Contract> = (
  input: ServerContextInput<ContractType>
) => object | PromiseLike<object>

type FragmentMetadata = {
  readonly owner: object
  readonly middlewares: readonly ServerMiddleware<object, Contract>[]
}

const fragmentMetadata = new WeakMap<object, FragmentMetadata>()

type RouteTopology = {
  readonly branches: ReadonlySet<string>
  readonly routes: readonly CompiledContractRoute[]
  readonly routeKeys: ReadonlySet<string>
}

function keyId(key: readonly string[]): string {
  return JSON.stringify(key)
}

function displayKey(key: readonly string[]): string {
  return key.join('.')
}

function createRouteTopology(contract: Contract): RouteTopology {
  const routes = compileContract(contract).routes as readonly CompiledContractRoute[]
  const routeKeys = new Set<string>()
  const branches = new Set<string>()

  for (const route of routes) {
    routeKeys.add(keyId(route.key))
    for (let length = 1; length < route.key.length; length++) branches.add(keyId(route.key.slice(0, length)))
  }

  return Object.freeze({ routes, routeKeys, branches })
}

function copyFragmentTree(
  topology: RouteTopology,
  handlers: unknown,
  prefix: readonly string[] = []
): Readonly<Record<string, unknown>> {
  const location = displayKey(prefix)
  if (!isRecord(handlers)) {
    throw new ServerImplementationError(
      'invalid-fragment',
      location === '' ? [] : [location],
      location === '' ? 'Server handler fragment must be an object' : `Handlers for "${location}" must be an object`
    )
  }

  const copy: Record<string, unknown> = {}

  for (const [key, handler] of Object.entries(handlers)) {
    const fullKey = [...prefix, key]
    const id = keyId(fullKey)
    const displayed = displayKey(fullKey)

    if (topology.routeKeys.has(id)) {
      if (typeof handler !== 'function') {
        throw new ServerImplementationError(
          'invalid-handler',
          [displayed],
          `Server handler "${displayed}" must be a function`
        )
      }

      setOwn(copy, key, handler)
      continue
    }

    if (!topology.branches.has(id)) {
      throw new ServerImplementationError('unknown-handler', [displayed], `Unknown server handler "${displayed}"`)
    }

    setOwn(copy, key, copyFragmentTree(topology, handler, fullKey))
  }

  return Object.freeze(copy)
}

function setTreeValue(target: Record<string, unknown>, key: readonly string[], value: unknown): void {
  let parent = target
  for (const segment of key.slice(0, -1)) {
    const existing = hasOwn(parent, segment) ? parent[segment] : undefined
    if (existing !== undefined && !isRecord(existing)) {
      throw new TypeError(`Server implementation key "${displayKey(key)}" collides with a route`)
    }
    const nested = (existing ?? {}) as Record<string, unknown>
    if (existing === undefined) setOwn(parent, segment, nested)
    parent = nested
  }

  const leaf = key.at(-1)
  if (leaf === undefined) throw new TypeError('Server implementation route key must not be empty')
  setOwn(parent, leaf, value)
}

function mergeFragmentTree(
  target: Record<string, unknown>,
  middlewareTarget: Record<string, unknown>,
  fragment: Readonly<Record<string, unknown>>,
  middlewares: readonly ServerMiddleware<object, Contract>[],
  seen: Set<string>,
  prefix: readonly string[] = []
): void {
  for (const [key, handler] of Object.entries(fragment)) {
    const fullKey = [...prefix, key]

    if (typeof handler === 'function') {
      const id = keyId(fullKey)
      const displayed = displayKey(fullKey)
      if (seen.has(id)) {
        throw new ServerImplementationError(
          'duplicate-handler',
          [displayed],
          `Server handler "${displayed}" is implemented more than once`
        )
      }

      seen.add(id)
      setTreeValue(target, fullKey, handler)
      setTreeValue(middlewareTarget, fullKey, middlewares)
      continue
    }

    mergeFragmentTree(
      target,
      middlewareTarget,
      handler as Readonly<Record<string, unknown>>,
      middlewares,
      seen,
      fullKey
    )
  }
}

function createDefinition<
  ContractType extends Contract,
  Context extends object,
  MiddlewareStatuses extends number = never,
>(
  contract: ContractType,
  options: DefineServerOptions<Context, ContractType>,
  middlewares: readonly ServerMiddleware<Context, ContractType>[] = [],
  owner: object = Object.freeze({}),
  topology: RouteTopology = createRouteTopology(contract)
): ServerDefinition<ContractType, Context, MiddlewareStatuses> {
  const frozenMiddlewares = Object.freeze([...middlewares])

  const middleware = (<const Handler extends ServerMiddlewareCandidate<Context, ContractType>>(handler: Handler) => {
    assertMiddleware('Server', handler)
    return handler
  }) as ServerDefinition<ContractType, Context, MiddlewareStatuses>['middleware']

  const use = (<const Middlewares extends readonly ServerMiddlewareCandidate<Context, ContractType>[]>(
    ...applied: Middlewares
  ) => {
    assertMiddlewares('Server', applied)

    return createDefinition<
      ContractType,
      Context,
      MiddlewareStatuses | ServerMiddlewareErrorStatuses<Middlewares[number]>
    >(
      contract,
      options,
      [...frozenMiddlewares, ...(applied as readonly ServerMiddleware<Context, ContractType>[])],
      owner,
      topology
    )
  }) as ServerDefinition<ContractType, Context, MiddlewareStatuses>['use']

  const implement = ((fragment: object) => {
    const value = copyFragmentTree(topology, fragment)
    fragmentMetadata.set(value, {
      owner,
      middlewares: frozenMiddlewares as readonly ServerMiddleware<object, Contract>[],
    })
    return value
  }) as ServerDefinition<ContractType, Context, MiddlewareStatuses>['implement']

  const build = ((...fragments: readonly object[]) => {
    const merged: Record<string, unknown> = {}
    const mergedMiddlewares: Record<string, unknown> = {}
    const seen = new Set<string>()

    for (const fragment of fragments) {
      const metadata = fragmentMetadata.get(fragment)

      if (metadata?.owner !== owner) {
        throw new ServerImplementationError(
          'invalid-fragment',
          [],
          'Server handler fragment belongs to a different server definition'
        )
      }

      mergeFragmentTree(
        merged,
        mergedMiddlewares,
        fragment as Readonly<Record<string, unknown>>,
        metadata.middlewares,
        seen
      )
    }

    const missing = topology.routes.filter((route) => !seen.has(keyId(route.key))).map((route) => displayKey(route.key))
    if (missing.length > 0) {
      throw new ServerImplementationError(
        'missing-handler',
        missing,
        `Missing server ${missing.length === 1 ? 'handler' : 'handlers'}: ${missing.join(', ')}`
      )
    }

    return Object.freeze({
      contract,
      handlers: freezeRecordTree(merged, false),
      context: options.context,
      middlewares: freezeRecordTree(mergedMiddlewares, false),
    })
  }) as ServerDefinition<ContractType, Context, MiddlewareStatuses>['build']

  return Object.freeze({
    contract,
    context: options.context,
    middlewares: frozenMiddlewares,
    middleware,
    use,
    implement,
    build,
  })
}

export function defineServer<
  const ContractType extends Contract,
  const Factory extends ContextFactoryShape<ContractType>,
>(
  contract: ContractType,
  options: {
    readonly context: Factory
  }
): ServerDefinition<ContractType, ContextFrom<Factory>>

export function defineServer<const ContractType extends Contract>(
  contract: ContractType,
  options?: DefineServerOptions<EmptyServerContext, NoInfer<ContractType>> & { readonly context?: undefined }
): ServerDefinition<ContractType, EmptyServerContext>

export function defineServer(contract: Contract, options: { readonly context?: unknown } = {}): unknown {
  return createDefinition(contract, options as DefineServerOptions<object, Contract>)
}
