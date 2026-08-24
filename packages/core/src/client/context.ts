import type { ContextFactory, ContextInput } from '../context'
import type { Contract } from '../contract'
import type { ClientTransportRequest } from './request'

export type {
  Awaitable,
  ContractRouteMetadata as ClientContractRouteMetadata,
  RouteMetadata as ClientRouteMetadata,
} from '../context'

export type ClientContextInput<ContractType extends Contract = Contract> = ContextInput<
  ContractType,
  ClientTransportRequest
>

export type ClientContextFactory<
  Context extends object = object,
  ContractType extends Contract = Contract,
> = ContextFactory<ClientContextInput<ContractType>, Context>
