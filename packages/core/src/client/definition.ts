import type { CompiledContractRoute } from '../compiler'
import { registerComposition } from '../composition'
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

  let createdFragments: WeakMap<object, object> | undefined
  const select = ((node: ContractRoute) => {
    const mount = mountedClientNode(contract, node)
    const root = isContractMount(mount)
    if (root) {
      throw new TypeError('The client is already executable; select a route or router')
    }
    const cached = createdFragments?.get(node)
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
    {
      const fragmentCache = (createdFragments ??= new WeakMap())
      fragmentCache.set(node, created.value)
      registerComposition(created.value, clientScope(), created.bindings)
    }
    return created.value
  }) as ClientDefinition<ContractType, Context, ErrorMode>['select']

  const value: Record<string, unknown> = {}
  const compose = ((...fragments: readonly object[]) =>
    composeClientFragments(contract, clientScope(), fragments)) as ClientDefinition<
    ContractType,
    Context,
    ErrorMode
  >['compose']
  Object.defineProperties(value, {
    contract: { value: contract },
    context: { value: options.context },
    middlewares: { value: middlewarePlan.all },
    middleware: { value: middleware },
    use: { value: use },
    select: { value: select },
    compose: { value: compose },
  })
  for (const [name, node] of Object.entries(contract.routes)) {
    Object.defineProperty(value, name, {
      enumerable: true,
      configurable: true,
      get() {
        const selected = select(node as never)
        Object.defineProperty(value, name, { enumerable: true, value: selected })
        return selected
      },
    })
  }
  return value as ClientDefinition<ContractType, Context, ErrorMode>
}

type ReservedClientNames = 'contract' | 'context' | 'middlewares' | 'middleware' | 'use' | 'select' | 'compose'
type ClientContract<C extends Contract> =
  Extract<keyof C['routes'], ReservedClientNames> extends never
    ? unknown
    : {
        readonly 'Reserved client root names': Extract<keyof C['routes'], ReservedClientNames>
      }

export function defineClient<
  const ContractType extends Contract,
  const Factory extends ContextFactoryShape<ContractType>,
  const ErrorMode extends ClientErrorMode = 'return',
>(
  contract: ContractType,
  options: DefineClientOptions<ContextFrom<Factory>, NoInfer<ContractType>, ErrorMode> &
    ClientContract<NoInfer<ContractType>> & {
      readonly context: Factory
    }
): ClientDefinition<ContractType, ContextFrom<Factory>, ErrorMode>

export function defineClient<const ContractType extends Contract, const ErrorMode extends ClientErrorMode = 'return'>(
  contract: ContractType,
  options: DefineClientOptions<EmptyClientContext, NoInfer<ContractType>, ErrorMode> &
    ClientContract<NoInfer<ContractType>> & {
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
  for (const name of ['contract', 'context', 'middlewares', 'middleware', 'use', 'select', 'compose']) {
    if (Object.hasOwn(contract.routes, name))
      throw new TypeError(`Client root name "${name}" is reserved for authoring`)
  }
  return createDefinition(contract, { ...options }, options.transport, createMiddlewarePlan(), {})
}
