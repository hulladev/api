import type { ContextFrom } from '../context'
import type { Contract, ContractRoutes } from '../contract'
import { assertMiddleware, assertMiddlewares } from '../middleware'
import { hasOwn, isRecord } from '../object'
import { type APIPlugin, type APIServerPluginList } from '../plugin'
import { normalizeAPIPlugins } from '../plugin-runtime'
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

function createDefinition<ContractType extends Contract, Context extends object, Plugins extends APIServerPluginList>(
  contract: ContractType,
  options: DefineServerOptions<Context, ContractType, Plugins>,
  plugins: Plugins,
  middlewares: readonly ServerMiddleware<Context, ContractType>[] = []
): ServerDefinition<ContractType, Context, Plugins> {
  const middleware = (<const Handler extends ServerMiddlewareCandidate<Context, ContractType>>(handler: Handler) => {
    assertMiddleware('Server', handler)
    return handler
  }) as ServerDefinition<ContractType, Context, Plugins>['middleware']

  const use = (<const Middlewares extends readonly ServerMiddlewareCandidate<Context, ContractType>[]>(
    ...applied: Middlewares
  ) => {
    assertMiddlewares('Server', applied)
    return createDefinition(contract, options, plugins, [
      ...middlewares,
      ...(applied as readonly ServerMiddleware<Context, ContractType>[]),
    ])
  }) as ServerDefinition<ContractType, Context, Plugins>['use']

  const build = ((handlers: object) => {
    assertCompleteHandlers(contract, handlers)
    for (const plugin of plugins as readonly APIPlugin[]) {
      plugin.server?.build?.({ contract, handlers: handlers as Readonly<Record<string, unknown>> })
    }
    return {
      contract,
      handlers,
      context: options.context,
      middlewares,
      plugins,
    }
  }) as ServerDefinition<ContractType, Context, Plugins>['build']

  return {
    contract,
    context: options.context,
    middlewares,
    plugins,
    middleware,
    use,
    build,
  }
}

export function defineServer<
  const ContractType extends Contract,
  const Factory extends ContextFactoryShape<ContractType>,
  const Plugins extends APIServerPluginList = readonly [],
>(
  contract: ContractType,
  options: {
    readonly context: Factory
    readonly plugins?: Plugins
  }
): ServerDefinition<ContractType, ContextFrom<Factory>, Plugins>

export function defineServer<
  const ContractType extends Contract,
  const Plugins extends APIServerPluginList = readonly [],
>(
  contract: ContractType,
  options?: DefineServerOptions<EmptyServerContext, NoInfer<ContractType>, Plugins> & {
    readonly context?: undefined
  }
): ServerDefinition<ContractType, EmptyServerContext, Plugins>

export function defineServer(
  contract: Contract,
  options: { readonly context?: unknown; readonly plugins?: readonly APIPlugin[] } = {}
): unknown {
  const plugins = normalizeAPIPlugins(options.plugins, 'server') as APIServerPluginList
  return createDefinition(contract, options as DefineServerOptions<object, Contract, APIServerPluginList>, plugins)
}
