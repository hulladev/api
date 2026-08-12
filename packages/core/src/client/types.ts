import type { Contract, ContractRoutes } from '../contract'
import type { RouteInput } from '../input'
import type { RouteResponses } from '../response'
import type { Route } from '../route'
import type { Router, RouterParamsForRoute } from '../router'
import type { ObjectSchema } from '../validation'
import type { ClientContextFactory } from './context'
import type { ClientMiddleware, ClientMiddlewareCandidate } from './middleware'
import type { ClientRequestOptions, ClientTransportOptions } from './request'
import type { ClientResponseResult } from './response'

export type ClientRouteInput<
  RouteType extends Route,
  RouterParams extends ObjectSchema | undefined = RouterParamsForRoute<RouteType>,
> = RouteInput<RouteType, RouterParams>

export type ClientRouteResult<ContractType extends Contract, RouteType extends Route> = RouteType extends {
  readonly responses: infer Responses extends RouteResponses
}
  ? ClientResponseResult<Responses> | ClientResponseResult<ContractType['errors']>
  : never

type ClientCallArguments<Input extends object> = keyof Input extends never
  ? readonly [options?: ClientRequestOptions]
  : readonly [input: Input, options?: ClientRequestOptions]

export type ClientRouteCall<
  ContractType extends Contract,
  RouteType extends Route,
  RouterParams extends ObjectSchema | undefined = RouterParamsForRoute<RouteType>,
> = (
  ...args: ClientCallArguments<ClientRouteInput<RouteType, RouterParams>>
) => Promise<ClientRouteResult<ContractType, RouteType>>

export type ClientRoutes<
  ContractType extends Contract,
  Routes extends ContractRoutes = ContractType['routes'],
  RouterParams extends ObjectSchema | undefined = undefined,
> = {
  readonly [Key in keyof Routes]: Routes[Key] extends Route
    ? ClientRouteCall<ContractType, Routes[Key], RouterParams>
    : Routes[Key] extends Router<string, infer NestedRoutes, infer NestedParams>
      ? ClientRoutes<ContractType, NestedRoutes, NestedParams>
      : never
}

export type DefineClientOptions<
  Context extends object,
  ContractType extends Contract = Contract,
> = ClientTransportOptions & {
  readonly context?: ClientContextFactory<Context, ContractType>
}

export type ClientDefinition<ContractType extends Contract, Context extends object> = {
  readonly contract: ContractType
  readonly context: ClientContextFactory<Context, ContractType> | undefined
  readonly middlewares: readonly ClientMiddleware<Context, ContractType>[]
  readonly middleware: <const Handler extends ClientMiddlewareCandidate<NoInfer<Context>, NoInfer<ContractType>>>(
    middleware: Handler
  ) => Handler
  readonly use: <
    const Middlewares extends readonly ClientMiddlewareCandidate<NoInfer<Context>, NoInfer<ContractType>>[],
  >(
    ...middlewares: Middlewares
  ) => ClientDefinition<ContractType, Context>
  readonly build: () => ClientRoutes<ContractType>
}

export type Client<ContractType extends Contract = Contract> = ClientRoutes<ContractType>
