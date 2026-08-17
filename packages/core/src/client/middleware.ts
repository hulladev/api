import type { Contract } from '../contract'
import type { MiddlewareInput, MiddlewareNext, NextMiddleware } from '../middleware'
import type { ClientContractRouteMetadata } from './context'

export type ClientMiddlewareNext<Result> = MiddlewareNext<Promise<Result>>

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
