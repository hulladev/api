import type { ContextFrom } from '../context'
import type { Contract, ContractRoutes } from '../contract'
import { assertMiddleware, assertMiddlewares } from '../middleware'
import { hasOwn, isRecord } from '../object'
import { isRouter, routerRoutes } from '../router'
import type { ServerContextInput } from './context'
import { ServerImplementationError } from './errors'
import type { ServerMiddleware, ServerMiddlewareCandidate } from './middleware'
import type { DefineServerOptions, ServerDefinition } from './types'

type EmptyServerContext = Record<string, never>
type ContextFactoryShape<ContractType extends Contract> = (
  input: ServerContextInput<ContractType>
) => object | PromiseLike<object>

function displayKey(key: readonly string[]): string {
  return key.join('.')
}

function collectMissingRoutes(routes: ContractRoutes, prefix: readonly string[], missing: string[]): void {
  for (const [key, definition] of Object.entries(routes)) {
    const childKey = [...prefix, key]
    if (isRouter(definition)) collectMissingRoutes(routerRoutes(definition), childKey, missing)
    else missing.push(displayKey(childKey))
  }
}

function validateHandlerTree(
  routes: ContractRoutes,
  handlers: Readonly<Record<string, unknown>>,
  prefix: readonly string[],
  missing: string[]
): void {
  for (const [key, definition] of Object.entries(routes)) {
    const childKey = [...prefix, key]
    const displayed = displayKey(childKey)
    if (!hasOwn(handlers, key)) {
      if (isRouter(definition)) collectMissingRoutes(routerRoutes(definition), childKey, missing)
      else missing.push(displayed)
      continue
    }

    const handler = handlers[key]
    if (isRouter(definition)) {
      if (!isRecord(handler)) {
        throw new ServerImplementationError(
          'invalid-handler',
          [displayed],
          `Handlers for "${displayed}" must be an object`
        )
      }
      validateHandlerTree(routerRoutes(definition), handler, childKey, missing)
    } else if (typeof handler !== 'function') {
      throw new ServerImplementationError(
        'invalid-handler',
        [displayed],
        `Server handler "${displayed}" must be a function`
      )
    }
  }

  for (const key of Object.keys(handlers)) {
    if (hasOwn(routes, key)) continue
    const displayed = displayKey([...prefix, key])
    throw new ServerImplementationError('unknown-handler', [displayed], `Unknown server handler "${displayed}"`)
  }
}

function assertCompleteHandlers(contract: Contract, handlers: unknown): asserts handlers is object {
  if (!isRecord(handlers)) {
    throw new ServerImplementationError('invalid-handler', [], 'Server handlers must be an object')
  }

  const missing: string[] = []
  validateHandlerTree(contract.routes, handlers, [], missing)

  if (missing.length > 0) {
    throw new ServerImplementationError(
      'missing-handler',
      missing,
      `Missing server ${missing.length === 1 ? 'handler' : 'handlers'}: ${missing.join(', ')}`
    )
  }
}

function createDefinition<ContractType extends Contract, Context extends object>(
  contract: ContractType,
  options: DefineServerOptions<Context, ContractType>,
  middlewares: readonly ServerMiddleware<Context, ContractType>[] = []
): ServerDefinition<ContractType, Context> {
  const middleware = (<const Handler extends ServerMiddlewareCandidate<Context, ContractType>>(handler: Handler) => {
    assertMiddleware('Server', handler)
    return handler
  }) as ServerDefinition<ContractType, Context>['middleware']

  const use = (<const Middlewares extends readonly ServerMiddlewareCandidate<Context, ContractType>[]>(
    ...applied: Middlewares
  ) => {
    assertMiddlewares('Server', applied)
    return createDefinition(contract, options, [
      ...middlewares,
      ...(applied as readonly ServerMiddleware<Context, ContractType>[]),
    ])
  }) as ServerDefinition<ContractType, Context>['use']

  const build = ((handlers: object) => {
    assertCompleteHandlers(contract, handlers)
    return {
      contract,
      handlers,
      context: options.context,
      middlewares,
    }
  }) as ServerDefinition<ContractType, Context>['build']

  return {
    contract,
    context: options.context,
    middlewares,
    middleware,
    use,
    build,
  }
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
