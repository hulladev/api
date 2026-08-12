import type { ContextFactory, ContextInput } from '../context'
import type { Contract } from '../contract'

export type {
  Awaitable,
  ContextFactory,
  ContextInput as ServerContextInput,
  ContractRouteMetadata as ServerRouteMetadata,
  RouteMetadata,
} from '../context'

export type ServerContextFactory<
  Context extends object = object,
  ContractType extends Contract = Contract,
> = ContextFactory<ContextInput<ContractType>, Context>
