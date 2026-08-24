import type { ContextFactory, ContractRouteMetadata } from '../context'
import type { Contract } from '../contract'

export type { Awaitable, ContextFactory, ContractRouteMetadata as ServerRouteMetadata, RouteMetadata } from '../context'

export type ServerContextInput<ContractType extends Contract = Contract> = {
  readonly route: ContractRouteMetadata<ContractType>
}

export type ServerContextFactory<
  Context extends object = object,
  ContractType extends Contract = Contract,
> = ContextFactory<ServerContextInput<ContractType>, Context>

const contextAdapters = new WeakMap<Function, string>()

/** Marks a context factory as requiring one specific server adapter. */
export function registerServerContextAdapter<const Factory extends Function>(
  adapter: string,
  factory: Factory
): Factory {
  if (adapter.length === 0) throw new TypeError('Server context adapter name must not be empty')
  contextAdapters.set(factory, adapter)
  return factory
}

/** Rejects a native-context factory when an incompatible adapter tries to execute it. */
export function assertServerContextAdapter(factory: Function | undefined, adapter: string): void {
  const required = factory === undefined ? undefined : contextAdapters.get(factory)
  if (required !== undefined && required !== adapter) {
    throw new TypeError(`Server context requires the ${required} adapter, but was mounted with ${adapter}`)
  }
}
