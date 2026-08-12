import type { Awaitable } from '../context'
import type { Contract } from '../contract'
import type { MiddlewareActions as CoreMiddlewareActions, MiddlewareInput, MiddlewareNextResult } from '../middleware'
import type { RouteResponses } from '../response'
import type { ServerRouteMetadata } from './context'
import type {
  ProducedServerResponse,
  ProducedServerResponseValue,
  ServerErrorResult,
  ServerErrorResponder,
} from './response'

export type { MiddlewareInput, MiddlewareNextResult } from '../middleware'

type ErrorAction<Errors extends RouteResponses> = [Extract<keyof Errors, number>] extends [never]
  ? { readonly error?: never }
  : { readonly error: ServerErrorResponder<Errors> }

export type MiddlewareActions<Result, Errors extends RouteResponses> = CoreMiddlewareActions<Result> &
  ErrorAction<Errors>

export type Middleware<
  Context extends object,
  RequestType,
  Route,
  Errors extends RouteResponses,
  Status extends Extract<keyof Errors, number> = Extract<keyof Errors, number>,
> = <Result>(
  actions: MiddlewareActions<Result, Errors>,
  input: MiddlewareInput<Context, RequestType, Route>
) => Awaitable<MiddlewareNextResult<Result> | ProducedServerResponse<ServerErrorResult<Errors, Status>>>

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
  actions: MiddlewareActions<Result, ContractType['errors']>,
  input: ServerMiddlewareInput<Context, ContractType>
) => Awaitable<MiddlewareNextResult<Result> | ProducedServerResponse<ServerErrorResult<ContractType['errors']>>>

type MiddlewareReturn<Handler> = Handler extends (...args: never[]) => infer Result ? Awaited<Result> : never
type MiddlewareResponseStatus<Value> = Value extends { readonly status: infer Status extends number } ? Status : never

export type ServerMiddlewareErrorStatuses<Handler> = MiddlewareResponseStatus<
  ProducedServerResponseValue<MiddlewareReturn<Handler>>
>
