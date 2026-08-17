import type { Awaitable } from '../context'
import type { Contract } from '../contract'
import type { MiddlewareInput, MiddlewareNext, MiddlewareOptions } from '../middleware'
import type { RouteResponses } from '../response'
import type { ServerRouteMetadata } from './context'
import type { ServerErrorResult, ServerResponseFactory } from './response'

export type ServerMiddlewareNext<Result> = MiddlewareNext<Promise<Result>>

export type Middleware<
  Context extends object,
  RequestType,
  Route,
  Errors extends RouteResponses,
  Status extends Extract<keyof Errors, number> = Extract<keyof Errors, number>,
> = <Result>(
  options: MiddlewareOptions<MiddlewareInput<Context, RequestType, Route>, Promise<Result>> & {
    readonly response: ServerResponseFactory<Errors>
  }
) => Awaitable<Result | ServerErrorResult<Errors, Status>>

export type ServerMiddlewareInput<Context extends object, ContractType extends Contract = Contract> = MiddlewareInput<
  Context,
  Request,
  ServerRouteMetadata<ContractType>
>

export type ServerMiddleware<
  Context extends object,
  ContractType extends Contract = Contract,
  Status extends Extract<keyof ContractType['errors'], number> = Extract<keyof ContractType['errors'], number>,
> = Middleware<Context, Request, ServerRouteMetadata<ContractType>, ContractType['errors'], Status>

export type ServerMiddlewareOptions<
  Context extends object,
  ContractType extends Contract = Contract,
  Result = unknown,
> = MiddlewareOptions<ServerMiddlewareInput<Context, ContractType>, Promise<Result>> & {
  readonly response: ServerResponseFactory<ContractType['errors']>
}

export type ServerMiddlewareCandidate<Context extends object, ContractType extends Contract = Contract> = <Result>(
  options: ServerMiddlewareOptions<Context, ContractType, Result>
) => Awaitable<Result | ServerErrorResult<ContractType['errors']>>
