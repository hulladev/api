import type { Awaitable } from '../context'
import type { Contract } from '../contract'
import type { MiddlewareInput, MiddlewareNext, MiddlewareOptions } from '../middleware'
import type { ClientContractRouteMetadata } from './context'
import type { ClientResponseFactory, ClientResponseResult } from './response'

export type ClientMiddlewareNext<Result> = MiddlewareNext<Promise<Result>>

export type ClientMiddlewareInput<Context extends object, ContractType extends Contract = Contract> = MiddlewareInput<
  Context,
  Request,
  ClientContractRouteMetadata<ContractType>
>

export type ClientMiddlewareOptions<
  Context extends object,
  ContractType extends Contract = Contract,
  Result = unknown,
> = MiddlewareOptions<ClientMiddlewareInput<Context, ContractType>, Promise<Result>> & {
  readonly response: ClientResponseFactory<ContractType['errors']>
}

export type ClientMiddleware<Context extends object, ContractType extends Contract = Contract> = <Result>(
  options: ClientMiddlewareOptions<Context, ContractType, Result>
) => Awaitable<Result | ClientResponseResult<ContractType['errors']>>

export type ClientMiddlewareCandidate<
  Context extends object,
  ContractType extends Contract = Contract,
> = ClientMiddleware<Context, ContractType>
