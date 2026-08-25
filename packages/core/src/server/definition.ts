import type { CompiledContractRoute } from '../compiler'
import { getCompositionState, registerComposition } from '../composition'
import type { Awaitable, ContextFactory, ContextFrom } from '../context'
import type { Contract, ContractRoute } from '../contract'
import { isContractMount } from '../contract/state'
import { appendMiddlewarePlan, assertMiddleware, createMiddlewarePlan, type MiddlewarePlan } from '../middleware'
import { isRecord } from '../object'
import type {
  ServerContextAdapterId,
  ServerContextAdapterInput,
  ServerContextInput,
  ServerContextRequirement,
} from './context'
import { ServerImplementationError } from './errors'
import { bindServerNode, composeServerFragments, mountedServerNode, type ServerScope } from './implementation'
import type { ServerMiddleware, ServerMiddlewareCandidate } from './middleware'
import type { DefineServerOptions, ServerDefinition } from './types'

type EmptyServerContext = Record<string, never>
type NativeContextFactory = ((input: never) => Awaitable<object>) & ServerContextRequirement

function createDefinition<
  ContractType extends Contract,
  Context extends object,
  AdapterId extends string | undefined,
  AdapterInput extends object,
>(
  contract: ContractType,
  options: DefineServerOptions<Context, ContractType, AdapterId, AdapterInput>,
  middlewarePlan: MiddlewarePlan<ServerMiddleware<Context, ContractType>, CompiledContractRoute>,
  owner: object,
  parent?: ServerScope
): ServerDefinition<ContractType, Context, AdapterId, AdapterInput> {
  const scope: ServerScope = {
    owner,
    ...(parent === undefined ? {} : { parent }),
  }
  const middleware = (<const Handler extends ServerMiddlewareCandidate<Context, ContractType>>(handler: Handler) => {
    assertMiddleware('Server', handler)
    return handler
  }) as ServerDefinition<ContractType, Context, AdapterId, AdapterInput>['middleware']

  const use = ((...applied: readonly unknown[]) => {
    return createDefinition(
      contract,
      options,
      appendMiddlewarePlan('Server', middlewarePlan, applied, (node) => mountedServerNode(contract, node).routes),
      owner,
      scope
    )
  }) as ServerDefinition<ContractType, Context, AdapterId, AdapterInput>['use']

  const implement = ((...values: readonly unknown[]) => {
    const first = values[0]
    const firstIsObject = (typeof first === 'object' && first !== null) || typeof first === 'function'
    if (firstIsObject && getCompositionState(first as object) !== undefined) {
      const composed = composeServerFragments(contract, scope, values as readonly object[])
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
    const mount = mountedServerNode(contract, node)
    const handlers = root ? values[0] : values[1]
    const bindings = bindServerNode(
      contract,
      node,
      mount,
      handlers,
      middlewarePlan as MiddlewarePlan<unknown, CompiledContractRoute>
    )
    const implementation = isContractMount(mount)
      ? {
          contract,
          handlers,
          context: options.context,
          middlewares: middlewarePlan[0],
        }
      : {
          contract,
          handlers,
          node,
          context: options.context,
          middlewares: middlewarePlan[0],
        }
    registerComposition(implementation, scope, bindings)
    return implementation
  }) as ServerDefinition<ContractType, Context, AdapterId, AdapterInput>['implement']

  return {
    contract,
    context: options.context,
    middlewares: middlewarePlan[0],
    middleware,
    use,
    implement,
  }
}

export function defineServer<const ContractType extends Contract, const Factory extends NativeContextFactory>(
  contract: ContractType,
  options: {
    readonly context: Factory
  }
): ServerDefinition<
  ContractType,
  ContextFrom<Factory>,
  ServerContextAdapterId<Factory>,
  ServerContextAdapterInput<Factory>
>

export function defineServer<const ContractType extends Contract, Context extends object>(
  contract: ContractType,
  options: {
    readonly context: ContextFactory<ServerContextInput<NoInfer<ContractType>>, Context>
  }
): ServerDefinition<ContractType, Context, undefined>

export function defineServer<const ContractType extends Contract>(
  contract: ContractType,
  options?: DefineServerOptions<EmptyServerContext, NoInfer<ContractType>> & {
    readonly context?: undefined
  }
): ServerDefinition<ContractType, EmptyServerContext, undefined>

export function defineServer(contract: Contract, options: { readonly context?: unknown } = {}): unknown {
  if (!isRecord(options)) throw new TypeError('Server options must be an object')
  if (options.context !== undefined && typeof options.context !== 'function') {
    throw new TypeError('Server context must be a function')
  }
  return createDefinition(
    contract,
    options as DefineServerOptions<object, Contract, string | undefined, object>,
    createMiddlewarePlan(),
    {}
  )
}
