import type { CompiledContractRoute } from '../compiler'
import { getCompositionState, isScopeDescendant, registerComposition } from '../composition'
import type { ContextFrom } from '../context'
import type { Contract, ContractRoute, ContractRoutes } from '../contract'
import { compileContractRoutes } from '../contract-compiler'
import { findContractMount, type ContractMount } from '../contract-state'
import {
  appendMiddlewarePlan,
  assertMiddleware,
  createMiddlewarePlan,
  type MiddlewarePlan,
  routeMiddlewares,
} from '../middleware'
import { hasOwn, isRecord, setOwn } from '../object'
import { isRouter, routerRoutes, type AnyRouter } from '../router'
import type { ServerContextInput } from './context'
import { ServerImplementationError } from './errors'
import { type ServerHandlerBinding, type ServerScope } from './implementation'
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

type HandlerBindingCollector = {
  readonly bindings: ServerHandlerBinding[]
  readonly compiledRoutes: readonly CompiledContractRoute[]
  index: number
  readonly middlewarePlan: MiddlewarePlan<unknown, CompiledContractRoute>
}

function validateHandlerTree(
  routes: ContractRoutes,
  handlers: Readonly<Record<string, unknown>>,
  prefix: readonly string[],
  missing: string[],
  collector?: HandlerBindingCollector
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
      validateHandlerTree(routerRoutes(definition), handler, childKey, missing, collector)
    } else if (typeof handler !== 'function') {
      throw new ServerImplementationError(
        'invalid-handler',
        [displayed],
        `Server handler "${displayed}" must be a function`
      )
    } else if (collector !== undefined) {
      const compiled = collector.compiledRoutes[collector.index++]
      if (compiled === undefined) throw new TypeError(`Compiled server route "${displayed}" is missing`)
      collector.bindings.push({
        compiled,
        handler: handler as (input: object) => unknown,
        middlewares: routeMiddlewares(collector.middlewarePlan, compiled),
      })
    }
  }

  for (const key of Object.keys(handlers)) {
    if (hasOwn(routes, key)) continue
    const displayed = displayKey([...prefix, key])
    throw new ServerImplementationError('unknown-handler', [displayed], `Unknown server handler "${displayed}"`)
  }
}

function mountedNode(contract: Contract, node: unknown): ContractMount {
  const mount = findContractMount(contract, node)
  if (mount === null) {
    throw new ServerImplementationError(
      'foreign-contract-node',
      [],
      'Server implementation node must belong to its server contract'
    )
  }
  if (mount === undefined) {
    throw new ServerImplementationError(
      'foreign-contract-node',
      [],
      'Server implementation node belongs to a different contract or is not mounted'
    )
  }
  return mount
}

function nodeBindings(
  contract: Contract,
  node: Contract | ContractRoute,
  mount: ContractMount,
  handlers: unknown,
  middlewarePlan: MiddlewarePlan<unknown, CompiledContractRoute>
): readonly ServerHandlerBinding[] {
  if (mount.kind === 'route') {
    if (typeof handlers !== 'function') {
      throw new ServerImplementationError(
        'invalid-handler',
        [displayKey(mount.key)],
        `Server handler "${displayKey(mount.key)}" must be a function`
      )
    }
    return [
      {
        compiled: mount.routes[0]!,
        handler: handlers as (input: object) => unknown,
        middlewares: routeMiddlewares(middlewarePlan, mount.routes[0]!),
      },
    ]
  }

  if (!isRecord(handlers)) {
    throw new ServerImplementationError(
      'invalid-handler',
      [displayKey(mount.key)],
      `Handlers for "${displayKey(mount.key) || '<root>'}" must be an object`
    )
  }

  if (mount.kind === 'router' && !isRouter(node)) {
    throw new ServerImplementationError(
      'foreign-contract-node',
      [displayKey(mount.key)],
      'Mounted server implementation router is invalid'
    )
  }
  const routes = mount.kind === 'contract' ? contract.routes : routerRoutes(node as AnyRouter)
  const missing: string[] = []
  const collector: HandlerBindingCollector = {
    bindings: [],
    compiledRoutes: mount.routes,
    index: 0,
    middlewarePlan,
  }
  validateHandlerTree(routes, handlers, mount.key, missing, collector)
  if (missing.length > 0) {
    throw new ServerImplementationError(
      'missing-handler',
      missing,
      `Missing server ${missing.length === 1 ? 'handler' : 'handlers'}: ${missing.join(', ')}`
    )
  }
  return collector.bindings
}

function setHandlerBinding(
  handlers: Record<string, unknown>,
  binding: ServerHandlerBinding,
  registered: Set<CompiledContractRoute>
): void {
  const key = binding.compiled.key
  const displayed = displayKey(key)
  if (registered.has(binding.compiled)) {
    throw new ServerImplementationError(
      'duplicate-handler',
      [displayed],
      `Server handler "${displayed}" is implemented more than once`
    )
  }
  registered.add(binding.compiled)

  let parent = handlers
  for (let index = 0; index < key.length - 1; index++) {
    const segment = key[index]!
    const existing = parent[segment]
    if (isRecord(existing)) {
      parent = existing as Record<string, unknown>
      continue
    }
    const nested: Record<string, unknown> = {}
    setOwn(parent, segment, nested)
    parent = nested
  }
  setOwn(parent, key.at(-1)!, binding.handler)
}

function composeFragments(
  contract: Contract,
  scope: ServerScope,
  fragments: readonly object[]
): { readonly bindings: readonly ServerHandlerBinding[]; readonly handlers: Readonly<Record<string, unknown>> } {
  const bindings: ServerHandlerBinding[] = []
  const handlers: Record<string, unknown> = {}
  const registered = new Set<CompiledContractRoute>()

  for (const fragment of fragments) {
    const state = getCompositionState<ServerHandlerBinding, ServerScope>(fragment)
    if (state === undefined || state.scope.owner !== scope.owner) {
      throw new ServerImplementationError(
        'foreign-implementation',
        [],
        'Server implementation fragment belongs to a different server definition'
      )
    }
    if (!isScopeDescendant(state.scope, scope)) {
      throw new ServerImplementationError(
        'foreign-implementation',
        [],
        'Server implementation fragment does not inherit the composition scope middleware'
      )
    }

    for (const binding of state.bindings) {
      setHandlerBinding(handlers, binding, registered)
      bindings.push(binding)
    }
  }

  const contractRoutes = compileContractRoutes(contract)
  if (registered.size !== contractRoutes.length) {
    const missing = contractRoutes.filter((route) => !registered.has(route)).map(({ key }) => displayKey(key))
    throw new ServerImplementationError(
      'missing-handler',
      missing,
      `Missing server ${missing.length === 1 ? 'handler' : 'handlers'}: ${missing.join(', ')}`
    )
  }
  return { bindings, handlers }
}

function createDefinition<ContractType extends Contract, Context extends object>(
  contract: ContractType,
  options: DefineServerOptions<Context, ContractType>,
  middlewarePlan: MiddlewarePlan<ServerMiddleware<Context, ContractType>, CompiledContractRoute>,
  owner: object,
  parent?: ServerScope
): ServerDefinition<ContractType, Context> {
  const scope: ServerScope = {
    owner,
    ...(parent === undefined ? {} : { parent }),
  }
  const middleware = (<const Handler extends ServerMiddlewareCandidate<Context, ContractType>>(handler: Handler) => {
    assertMiddleware('Server', handler)
    return handler
  }) as ServerDefinition<ContractType, Context>['middleware']

  const use = ((...applied: readonly unknown[]) => {
    return createDefinition(
      contract,
      options,
      appendMiddlewarePlan('Server', middlewarePlan, applied, (node) => mountedNode(contract, node).routes),
      owner,
      scope
    )
  }) as ServerDefinition<ContractType, Context>['use']

  const implement = ((...values: readonly unknown[]) => {
    const first = values[0]
    const firstIsObject = (typeof first === 'object' && first !== null) || typeof first === 'function'
    if (firstIsObject && getCompositionState(first as object) !== undefined) {
      const composed = composeFragments(contract, scope, values as readonly object[])
      const handlers = composed.handlers
      const bindings = composed.bindings
      const implementation = {
        contract,
        handlers,
        context: options.context,
        middlewares: middlewarePlan[0],
      }
      registerComposition(implementation, scope, bindings)
      return implementation
    }

    const root = values.length === 1
    if (!root && values.length !== 2) {
      throw new ServerImplementationError(
        'invalid-handler',
        [],
        'Server implement expects handlers or a node and handlers'
      )
    }
    const node = root ? contract : (values[0] as ContractRoute)
    if (node === contract && !root) {
      throw new ServerImplementationError('invalid-handler', [], 'Implement the root server with implement(handlers)')
    }
    const mount = mountedNode(contract, node)
    const handlers = root ? values[0] : values[1]
    const bindings = nodeBindings(
      contract,
      node,
      mount,
      handlers,
      middlewarePlan as MiddlewarePlan<unknown, CompiledContractRoute>
    )
    const implementation =
      mount.kind === 'contract'
        ? {
            contract,
            handlers,
            context: options.context,
            middlewares: middlewarePlan[0],
          }
        : {
            kind: 'server-implementation-fragment' as const,
            contract,
            handlers,
            node,
            context: options.context,
            middlewares: middlewarePlan[0],
          }
    registerComposition(implementation, scope, bindings)
    return implementation
  }) as ServerDefinition<ContractType, Context>['implement']

  return {
    contract,
    context: options.context,
    middlewares: middlewarePlan[0],
    middleware,
    use,
    implement,
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
  options?: DefineServerOptions<EmptyServerContext, NoInfer<ContractType>> & {
    readonly context?: undefined
  }
): ServerDefinition<ContractType, EmptyServerContext>

export function defineServer(contract: Contract, options: { readonly context?: unknown } = {}): unknown {
  if (!isRecord(options)) throw new TypeError('Server options must be an object')
  if (options.context !== undefined && typeof options.context !== 'function') {
    throw new TypeError('Server context must be a function')
  }
  return createDefinition(contract, options as DefineServerOptions<object, Contract>, createMiddlewarePlan(), {})
}
