import type { ContextFrom } from '../context'
import type { Contract, ContractRoutes } from '../contract'
import { assertMiddleware, assertMiddlewares } from '../middleware'
import { freezeRecordTree, hasOwn, isRecord, setOwn } from '../object'
import { isRouter, routerRoutes } from '../router'
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

function qualifiedKey(prefix: string, key: string): string {
  return prefix === '' ? key : `${prefix}.${key}`
}

function copyFragmentTree(routes: ContractRoutes, handlers: unknown, prefix = ''): Readonly<Record<string, unknown>> {
  if (!isRecord(handlers)) {
    throw new ServerImplementationError(
      'invalid-fragment',
      prefix === '' ? [] : [prefix],
      prefix === '' ? 'Server handler fragment must be an object' : `Handlers for "${prefix}" must be an object`
    )
  }

  const copy: Record<string, unknown> = {}

  for (const [key, handler] of Object.entries(handlers)) {
    const fullKey = qualifiedKey(prefix, key)

    if (!hasOwn(routes, key)) {
      throw new ServerImplementationError('unknown-handler', [fullKey], `Unknown server handler "${fullKey}"`)
    }
    const definition = routes[key]!

    if (!isRouter(definition)) {
      if (typeof handler !== 'function') {
        throw new ServerImplementationError(
          'invalid-handler',
          [fullKey],
          `Server handler "${fullKey}" must be a function`
        )
      }

      setOwn(copy, key, handler)
      continue
    }

    setOwn(copy, key, copyFragmentTree(routerRoutes(definition), handler, fullKey))
  }

  return Object.freeze(copy)
}

function routeKeys(routes: ContractRoutes, prefix = ''): readonly string[] {
  const keys: string[] = []

  for (const [key, definition] of Object.entries(routes)) {
    const fullKey = qualifiedKey(prefix, key)

    if (!isRouter(definition)) keys.push(fullKey)
    else keys.push(...routeKeys(routerRoutes(definition), fullKey))
  }

  return keys
}

function mergeFragmentTree(
  routes: ContractRoutes,
  target: Record<string, unknown>,
  middlewareTarget: Record<string, unknown>,
  fragment: Readonly<Record<string, unknown>>,
  middlewares: readonly ServerMiddleware<object, Contract>[],
  seen: Set<string>,
  prefix = ''
): void {
  for (const [key, handler] of Object.entries(fragment)) {
    const fullKey = qualifiedKey(prefix, key)

    if (!hasOwn(routes, key)) {
      throw new ServerImplementationError('unknown-handler', [fullKey], `Unknown server handler "${fullKey}"`)
    }
    const definition = routes[key]!

    if (!isRouter(definition)) {
      if (seen.has(fullKey)) {
        throw new ServerImplementationError(
          'duplicate-handler',
          [fullKey],
          `Server handler "${fullKey}" is implemented more than once`
        )
      }

      seen.add(fullKey)
      setOwn(target, key, handler)
      setOwn(middlewareTarget, key, middlewares)
      continue
    }

    const nestedTarget = hasOwn(target, key) && isRecord(target[key]) ? (target[key] as Record<string, unknown>) : {}
    const nestedMiddlewareTarget =
      hasOwn(middlewareTarget, key) && isRecord(middlewareTarget[key])
        ? (middlewareTarget[key] as Record<string, unknown>)
        : {}
    setOwn(target, key, nestedTarget)
    setOwn(middlewareTarget, key, nestedMiddlewareTarget)
    mergeFragmentTree(
      routerRoutes(definition),
      nestedTarget,
      nestedMiddlewareTarget,
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
  owner: object = Object.freeze({})
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
      owner
    )
  }) as ServerDefinition<ContractType, Context, MiddlewareStatuses>['use']

  const implement = ((fragment: object) => {
    const value = copyFragmentTree(contract.routes, fragment)
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
        contract.routes,
        merged,
        mergedMiddlewares,
        fragment as Readonly<Record<string, unknown>>,
        metadata.middlewares,
        seen
      )
    }

    const missing = routeKeys(contract.routes).filter((key) => !seen.has(key))
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
