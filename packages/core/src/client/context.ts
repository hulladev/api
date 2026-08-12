import type { ContextFactory, ContextInput } from '../context'
import type { Contract } from '../contract'

export type {
  Awaitable,
  ContextInput as ClientContextInput,
  ContractRouteMetadata as ClientContractRouteMetadata,
  RouteMetadata as ClientRouteMetadata,
} from '../context'

export type ClientContextFactory<
  Context extends object = object,
  ContractType extends Contract = Contract,
> = ContextFactory<ContextInput<ContractType>, Context>
