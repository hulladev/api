import type { CompiledContractRoute } from '../compiler'
import type { Awaitable, ContextFactory, ContextFrom } from '../context'
import type { Contract, ContractRoute } from '../contract'
import { isContractMount } from '../contract/state'
import { appendMiddlewarePlan, assertMiddleware, createMiddlewarePlan, type MiddlewarePlan } from '../middleware'
import { isRecord } from '../object'
import { registerComposition } from './composition'
import type {
  ServerContextAdapterId,
  ServerContextAdapterInput,
  ServerContextFactory,
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
  context: ServerContextFactory<Context, ContractType, AdapterId, AdapterInput> | undefined,
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
      context,
      appendMiddlewarePlan('Server', middlewarePlan, applied, (node) => mountedServerNode(contract, node).routes),
      owner,
      scope
    )
  }) as ServerDefinition<ContractType, Context, AdapterId, AdapterInput>['use']

  const compose = ((...fragments: readonly object[]) => {
    const { handlers, bindings } = composeServerFragments(contract, scope, fragments)
    const implementation = Object.freeze({
      contract,
      handlers,
      bindings,
      context,
      middlewares: middlewarePlan.all,
    })
    Object.freeze(bindings)
    Object.freeze(implementation)
    registerComposition(implementation, scope, bindings)
    return implementation
  }) as ServerDefinition<ContractType, Context, AdapterId, AdapterInput>['compose']

  const implement = ((...values: readonly unknown[]) => {
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
          bindings,
          context,
          middlewares: middlewarePlan.all,
        }
      : {
          contract,
          handlers,
          bindings,
          node,
          context,
          middlewares: middlewarePlan.all,
        }
    Object.freeze(bindings)
    Object.freeze(implementation)
    registerComposition(implementation, scope, bindings)
    return implementation
  }) as ServerDefinition<ContractType, Context, AdapterId, AdapterInput>['implement']

  return {
    contract,
    context,
    middlewares: middlewarePlan.all,
    middleware,
    use,
    implement,
    compose,
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
  return createDefinition(contract, options.context as NativeContextFactory | undefined, createMiddlewarePlan(), {})
}
