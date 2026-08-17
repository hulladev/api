import type { Awaitable } from '../context'
import type { Contract } from '../contract'
import type { MiddlewareInput, MiddlewareNext } from '../middleware'
import type { RouteResponses } from '../response'
import type { ServerRouteMetadata } from './context'
import type { ServerErrorResult } from './response'

export type ServerMiddlewareNext<Result> = MiddlewareNext<Promise<Result>>

export type Middleware<
  Context extends object,
  RequestType,
  Route,
  Errors extends RouteResponses,
  Status extends Extract<keyof Errors, number> = Extract<keyof Errors, number>,
> = <Result>(
  input: MiddlewareInput<Context, RequestType, Route>,
  next: ServerMiddlewareNext<Result>
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

export type ServerMiddlewareCandidate<Context extends object, ContractType extends Contract = Contract> = <Result>(
  input: ServerMiddlewareInput<Context, ContractType>,
  next: ServerMiddlewareNext<Result>
) => Awaitable<Result | ServerErrorResult<ContractType['errors']>>
