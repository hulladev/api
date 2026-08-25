import type { CompiledContractRoute } from '../compiler'
import { getCompositionState, isScopeDescendant, type CompositionScope } from '../composition'
import type { Contract, ContractRoute, ContractRoutes } from '../contract'
import { isRouter, routerRoutes, type AnyRouter } from '../contract/router'
import {
  compileContractRoutes,
  findContractMount,
  isContractMount,
  isRouteMount,
  type ContractMount,
} from '../contract/state'
import { type MiddlewarePlan, routeMiddlewares } from '../middleware'
import { hasOwn, isRecord, setOwn } from '../object'
import { ServerImplementationError } from './errors'

export type ServerHandlerBinding = {
  readonly compiled: CompiledContractRoute
  readonly handler: (input: object) => unknown
  readonly middlewares: readonly unknown[]
}

export type ServerScope = CompositionScope

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

export function mountedServerNode(contract: Contract, node: unknown): ContractMount {
  const mount = findContractMount(contract, node)
  if (mount === null) {
    throw new ServerImplementationError(
      'foreign-contract-node',
      [],
      'Server implementation node must belong to its server contract'
    )
  }
  if (mount === undefined) {
    throw new ServerImplementationError('foreign-contract-node', [], 'Server node is not mounted in this contract')
  }
  return mount
}

export function bindServerNode(
  contract: Contract,
  node: Contract | ContractRoute,
  mount: ContractMount,
  handlers: unknown,
  middlewarePlan: MiddlewarePlan<unknown, CompiledContractRoute>
): readonly ServerHandlerBinding[] {
  if (isRouteMount(mount, node)) {
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

  if (!isContractMount(mount) && !isRouter(node)) {
    throw new ServerImplementationError(
      'foreign-contract-node',
      [displayKey(mount.key)],
      'Mounted server implementation router is invalid'
    )
  }
  const routes = isContractMount(mount) ? contract.routes : routerRoutes(node as AnyRouter)
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

export function composeServerFragments(
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
      throw new ServerImplementationError('foreign-implementation', [], 'Server fragment belongs to another definition')
    }
    if (!isScopeDescendant(state.scope, scope)) {
      throw new ServerImplementationError(
        'foreign-implementation',
        [],
        'Server fragment has an incompatible middleware scope'
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
