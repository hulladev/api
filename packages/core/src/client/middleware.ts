import type { Contract } from '../contract'
import type { MiddlewareInput, NextMiddleware } from '../middleware'
import type { ClientContractRouteMetadata } from './context'

export type {
  MiddlewareActions as ClientMiddlewareActions,
  MiddlewareNextResult as ClientMiddlewareNextResult,
} from '../middleware'

export type ClientMiddlewareInput<Context extends object, ContractType extends Contract = Contract> = MiddlewareInput<
  Context,
  Request,
  ClientContractRouteMetadata<ContractType>
>

export type ClientMiddleware<Context extends object, ContractType extends Contract = Contract> = NextMiddleware<
  Context,
  Request,
  ClientContractRouteMetadata<ContractType>
>

export type ClientMiddlewareCandidate<
  Context extends object,
  ContractType extends Contract = Contract,
> = ClientMiddleware<Context, ContractType>
