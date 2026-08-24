import type { Awaitable } from '../context'
import type { Contract } from '../contract'
import type { ClientErrorResponseResult, ErrorFactoryField } from '../declared-errors'
import type { MiddlewareInput, MiddlewareNext, MiddlewareOptions } from '../middleware'
import type { ClientContractRouteMetadata } from './context'
import type { ClientTransportRequest } from './request'

export type ClientMiddlewareNext<Result> = MiddlewareNext<Promise<Result>>

export type ClientMiddlewareInput<Context extends object, ContractType extends Contract = Contract> = MiddlewareInput<
  Context,
  ClientTransportRequest,
  ClientContractRouteMetadata<ContractType>
>

export type ClientMiddlewareOptions<
  Context extends object,
  ContractType extends Contract = Contract,
  Result = unknown,
> = MiddlewareOptions<ClientMiddlewareInput<Context, ContractType>, Promise<Result>> &
  ErrorFactoryField<ContractType['errors']>

export type ClientMiddleware<Context extends object, ContractType extends Contract = Contract> = <Result>(
  options: ClientMiddlewareOptions<Context, ContractType, Result>
) => Awaitable<Result | ClientErrorResponseResult<ContractType['errors']>>

export type ClientMiddlewareCandidate<
  Context extends object,
  ContractType extends Contract = Contract,
> = ClientMiddleware<Context, ContractType>
