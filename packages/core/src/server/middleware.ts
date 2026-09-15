import type { Awaitable } from '../context'
import type { Contract } from '../contract'
import type { ErrorFactoryField, ErrorInstance, NormalizedErrorStatusMap } from '../declared-errors'
import type { MiddlewareNext, MiddlewareOptions } from '../middleware'
import type { ServerRouteMetadata } from './context'

export type ServerMiddlewareNext<Result> = MiddlewareNext<Promise<Result>>

export type Middleware<Context extends object, Route, Errors extends NormalizedErrorStatusMap> = <Result>(
  options: MiddlewareOptions<
    { readonly signal: AbortSignal; readonly context: Readonly<Context>; readonly route: Route },
    Promise<Result>
  > &
    ErrorFactoryField<Errors>
) => Awaitable<Result | ErrorInstance<Errors>>

export type ServerMiddlewareInput<Context extends object, ContractType extends Contract = Contract> = {
  readonly signal: AbortSignal
  readonly context: Readonly<Context>
  readonly route: ServerRouteMetadata<ContractType>
}

export type ServerMiddleware<Context extends object, ContractType extends Contract = Contract> = Middleware<
  Context,
  ServerRouteMetadata<ContractType>,
  ContractType['errors']
>

export type ServerMiddlewareOptions<
  Context extends object,
  ContractType extends Contract = Contract,
  Result = unknown,
> = MiddlewareOptions<ServerMiddlewareInput<Context, ContractType>, Promise<Result>> &
  ErrorFactoryField<ContractType['errors']>

export type ServerMiddlewareCandidate<Context extends object, ContractType extends Contract = Contract> = <Result>(
  options: ServerMiddlewareOptions<Context, ContractType, Result>
) => Awaitable<Result | ErrorInstance<ContractType['errors']>>
