import type { Contract, ContractRoutes } from '../contract'
import type { ServerContextInput } from './context'
import { ServerImplementationError } from './errors'
import type { ServerMiddleware, ServerMiddlewareCandidate, ServerMiddlewareErrorStatuses } from './middleware'
import type { DefineServerOptions, ServerDefinition } from './types'

type EmptyServerContext = Record<string, never>
type ContextFactoryShape<ContractType extends Contract> = (
  input: ServerContextInput<ContractType>
) => object | PromiseLike<object>
type ContextFrom<Factory extends (...args: never[]) => unknown> = Awaited<ReturnType<Factory>>

type FragmentMetadata = {
  readonly owner: object
  readonly middlewares: readonly ServerMiddleware<object, Contract>[]
}

const fragmentMetadata = new WeakMap<object, FragmentMetadata>()

function isRecord(value: unknown): value is Readonly<Record<string, unknown>> {
  return typeof value === 'object' && value !== null && !Array.isArray(value)
}

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
    const definition = routes[key]
    const fullKey = qualifiedKey(prefix, key)

    if (!definition) {
      throw new ServerImplementationError('unknown-handler', [fullKey], `Unknown server handler "${fullKey}"`)
    }

    if (definition.kind === 'route') {
      if (typeof handler !== 'function') {
        throw new ServerImplementationError(
          'invalid-handler',
          [fullKey],
          `Server handler "${fullKey}" must be a function`
        )
      }

      copy[key] = handler
      continue
    }

    copy[key] = copyFragmentTree(definition.routes, handler, fullKey)
  }

  return Object.freeze(copy)
}

function routeKeys(routes: ContractRoutes, prefix = ''): readonly string[] {
  const keys: string[] = []

  for (const [key, definition] of Object.entries(routes)) {
    const fullKey = qualifiedKey(prefix, key)

    if (definition.kind === 'route') keys.push(fullKey)
    else keys.push(...routeKeys(definition.routes, fullKey))
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
    const definition = routes[key]
    const fullKey = qualifiedKey(prefix, key)

    if (!definition) {
      throw new ServerImplementationError('unknown-handler', [fullKey], `Unknown server handler "${fullKey}"`)
    }

    if (definition.kind === 'route') {
      if (seen.has(fullKey)) {
        throw new ServerImplementationError(
          'duplicate-handler',
          [fullKey],
          `Server handler "${fullKey}" is implemented more than once`
        )
      }

      seen.add(fullKey)
      target[key] = handler
      middlewareTarget[key] = middlewares
      continue
    }

    const nestedTarget = isRecord(target[key]) ? (target[key] as Record<string, unknown>) : {}
    const nestedMiddlewareTarget = isRecord(middlewareTarget[key])
      ? (middlewareTarget[key] as Record<string, unknown>)
      : {}
    target[key] = nestedTarget
    middlewareTarget[key] = nestedMiddlewareTarget
    mergeFragmentTree(
      definition.routes,
      nestedTarget,
      nestedMiddlewareTarget,
      handler as Readonly<Record<string, unknown>>,
      middlewares,
      seen,
      fullKey
    )
  }
}

function freezeHandlerTree(value: Record<string, unknown>): Readonly<Record<string, unknown>> {
  for (const [key, nested] of Object.entries(value)) {
    if (isRecord(nested)) value[key] = freezeHandlerTree(nested as Record<string, unknown>)
  }

  return Object.freeze(value)
}

function freezeMiddlewareTree(value: Record<string, unknown>): Readonly<Record<string, unknown>> {
  for (const [key, nested] of Object.entries(value)) {
    if (isRecord(nested)) value[key] = freezeMiddlewareTree(nested as Record<string, unknown>)
  }

  return Object.freeze(value)
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
    if (typeof handler !== 'function') throw new TypeError('Server middleware must be a function')
    return handler
  }) as ServerDefinition<ContractType, Context, MiddlewareStatuses>['middleware']

  const use = (<const Middlewares extends readonly ServerMiddlewareCandidate<Context, ContractType>[]>(
    ...applied: Middlewares
  ) => {
    for (const handler of applied) {
      if (typeof handler !== 'function') throw new TypeError('Server middleware must be a function')
    }

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
      handlers: freezeHandlerTree(merged),
      context: options.context,
      middlewares: freezeMiddlewareTree(mergedMiddlewares),
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
