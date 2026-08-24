import type { ContextFactory, ContractRouteMetadata } from '../context'
import type { Contract } from '../contract'
import type { ServerAdapter, ServerAdapterContextInput } from './adapter'

export type { Awaitable, ContextFactory, ContractRouteMetadata as ServerRouteMetadata, RouteMetadata } from '../context'

export type ServerContextInput<ContractType extends Contract = Contract> = {
  readonly route: ContractRouteMetadata<ContractType>
}

export type ServerContextInputFor<
  ContractType extends Contract,
  Adapter extends ServerAdapter | undefined,
> = ServerContextInput<ContractType> & (Adapter extends ServerAdapter ? ServerAdapterContextInput<Adapter> : object)

export type ServerContextFactory<
  Context extends object = object,
  ContractType extends Contract = Contract,
  Adapter extends ServerAdapter | undefined = undefined,
> = ContextFactory<ServerContextInputFor<ContractType, Adapter>, Context>
