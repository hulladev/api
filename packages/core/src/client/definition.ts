import type { CompiledContractRoute } from '../compiler'
import { getCompositionState, registerComposition } from '../composition'
import type { ContextFrom } from '../context'
import type { Contract, ContractRoute } from '../contract'
import { isContractMount } from '../contract/state'
import type { ClientErrorMode } from '../declared-errors'
import { appendMiddlewarePlan, assertMiddleware, createMiddlewarePlan, type MiddlewarePlan } from '../middleware'
import { isRecord } from '../object'
import type { ClientContextInput } from './context'
import { buildClientNode, composeClientFragments, mountedClientNode, type ClientScope } from './creation'
import type { ClientMiddleware, ClientMiddlewareCandidate } from './middleware'
import type { ClientTransport } from './request'
import type { ClientDefinition, DefineClientOptions } from './types'

type EmptyClientContext = Record<string, never>
type ContextFactoryShape<ContractType extends Contract> = (
  input: ClientContextInput<ContractType>
) => object | PromiseLike<object>

function createDefinition<ContractType extends Contract, Context extends object, ErrorMode extends ClientErrorMode>(
  contract: ContractType,
  options: DefineClientOptions<Context, ContractType, ErrorMode>,
  transport: ClientTransport,
  middlewarePlan: MiddlewarePlan<ClientMiddleware<Context, ContractType>, CompiledContractRoute>,
  owner: object,
  parent?: ClientScope
): ClientDefinition<ContractType, Context, ErrorMode> {
  let scope: ClientScope | undefined
  const clientScope = (): ClientScope =>
    (scope ??= {
      owner,
      ...(parent === undefined ? {} : { parent }),
    })

  const middleware = (<const Handler extends ClientMiddlewareCandidate<Context, ContractType>>(handler: Handler) => {
    assertMiddleware('Client', handler)
    return handler
  }) as ClientDefinition<ContractType, Context, ErrorMode>['middleware']

  const use = ((...applied: readonly unknown[]) => {
    return createDefinition(
      contract,
      options,
      transport,
      appendMiddlewarePlan('Client', middlewarePlan, applied, (node) => mountedClientNode(contract, node).routes),
      owner,
      clientScope()
    )
  }) as ClientDefinition<ContractType, Context, ErrorMode>['use']

  let rootClient: object | undefined
  let createdFragments: WeakMap<object, object> | undefined
  const create = ((...values: readonly object[]) => {
    if (values.length > 0) {
      const first = values[0]!
      if (getCompositionState(first) !== undefined || values.length > 1) {
        return composeClientFragments(contract, clientScope(), values)
      }
    }

    const node: Contract | ContractRoute = values.length === 0 ? contract : (values[0] as ContractRoute)
    const mount = mountedClientNode(contract, node)
    const root = isContractMount(mount)
    if (root && values.length > 0) {
      throw new TypeError('Create the root client with create()')
    }
    const cached = root ? rootClient : createdFragments?.get(node)
    if (cached !== undefined) return cached
    const created = buildClientNode(
      contract,
      node,
      mount,
      transport,
      options.headers,
      options.context as ((input: ClientContextInput) => object | PromiseLike<object>) | undefined,
      middlewarePlan as MiddlewarePlan<ClientMiddleware<object, Contract>, CompiledContractRoute>,
      options.errorMode ?? 'return'
    )
    if (root) rootClient = created.value
    else {
      const fragmentCache = (createdFragments ??= new WeakMap())
      fragmentCache.set(node, created.value)
      registerComposition(created.value, clientScope(), created.bindings)
    }
    return created.value
  }) as ClientDefinition<ContractType, Context, ErrorMode>['create']

  return {
    contract,
    context: options.context,
    middlewares: middlewarePlan[0],
    middleware,
    use,
    create,
  }
}

export function defineClient<
  const ContractType extends Contract,
  const Factory extends ContextFactoryShape<ContractType>,
  const ErrorMode extends ClientErrorMode = 'return',
>(
  contract: ContractType,
  options: DefineClientOptions<ContextFrom<Factory>, NoInfer<ContractType>, ErrorMode> & {
    readonly context: Factory
  }
): ClientDefinition<ContractType, ContextFrom<Factory>, ErrorMode>

export function defineClient<const ContractType extends Contract, const ErrorMode extends ClientErrorMode = 'return'>(
  contract: ContractType,
  options: DefineClientOptions<EmptyClientContext, NoInfer<ContractType>, ErrorMode> & {
    readonly context?: undefined
  }
): ClientDefinition<ContractType, EmptyClientContext, ErrorMode>

export function defineClient(
  contract: Contract,
  options: DefineClientOptions<object, Contract, ClientErrorMode>
): unknown {
  if (!isRecord(options)) throw new TypeError('Client options must be an object')
  if (options.context !== undefined && typeof options.context !== 'function') {
    throw new TypeError('Client context must be a function')
  }
  if (typeof options.transport !== 'function') throw new TypeError('Client transport must be a function')
  if (options.errorMode !== undefined && options.errorMode !== 'return' && options.errorMode !== 'throw') {
    throw new TypeError('Client errorMode must be "return" or "throw"')
  }
  return createDefinition(contract, options, options.transport, createMiddlewarePlan(), {})
}
