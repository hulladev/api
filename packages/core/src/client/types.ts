import type { Contract, ContractNodeIdentity, ContractRoutes } from '../contract'
import type { RouteInputSource } from '../contract/input'
import type { RouteResponses } from '../contract/response'
import type { Route } from '../contract/route'
import type { AnyRouter, RouterChildrenFor, RouterParamsForRoute } from '../contract/router'
import type { ClientErrorMode, ClientErrorResponseResult } from '../declared-errors'
import type { ObjectSchema } from '../validation'
import type { ClientContextFactory } from './context'
import type { ClientMiddleware } from './middleware'
import type { ClientHeaders, ClientRequestOptions, ClientTransport } from './request'
import type { ClientResponseResult } from './response'

export type ClientRouteInput<
  RouteType extends Route,
  RouterParams extends ObjectSchema | undefined = RouterParamsForRoute<RouteType>,
> = RouteInputSource<RouteType, RouterParams>

export type ClientRouteResult<
  ContractType extends Contract,
  RouteType extends Route,
  ErrorMode extends ClientErrorMode = 'return',
> = RouteType extends {
  readonly responses: infer Responses extends RouteResponses
}
  ?
      | ClientResponseResult<Responses>
      | (ErrorMode extends 'return' ? ClientErrorResponseResult<ContractType['errors']> : never)
  : never

type ClientCallArguments<Input extends object> = keyof Input extends never
  ? readonly [options?: ClientRequestOptions]
  : readonly [input: Input, options?: ClientRequestOptions]

export type ClientRouteCall<
  ContractType extends Contract,
  RouteType extends Route,
  RouterParams extends ObjectSchema | undefined = RouterParamsForRoute<RouteType>,
  ErrorMode extends ClientErrorMode = 'return',
> = (
  ...args: ClientCallArguments<ClientRouteInput<RouteType, RouterParams>>
) => Promise<ClientRouteResult<ContractType, RouteType, ErrorMode>>

export type ClientRoutes<
  ContractType extends Contract,
  Routes extends ContractRoutes = ContractType['routes'],
  ErrorMode extends ClientErrorMode = 'return',
> = {
  readonly [Key in keyof Routes]: Routes[Key] extends Route
    ? ClientRouteCall<ContractType, Routes[Key], RouterParamsForRoute<Routes[Key]>, ErrorMode>
    : Routes[Key] extends AnyRouter
      ? ClientRoutes<ContractType, RouterChildrenFor<Routes[Key]>, ErrorMode>
      : never
}

/** A normalized root, route, or router carries its public selection manifest. */
export type ClientSource = Contract | ((Route | AnyRouter) & ContractNodeIdentity<readonly string[]>)

export type ClientContractFor<Source extends ClientSource> = Source extends Contract
  ? Source
  : Contract<string, ContractRoutes, Source['$contract']['errors']>

export type ClientFor<
  Source extends ClientSource,
  ErrorMode extends ClientErrorMode = 'return',
> = Source extends Contract
  ? ClientRoutes<Source, Source['routes'], ErrorMode>
  : Source extends Route
    ? ClientRouteCall<ClientContractFor<Source>, Source, RouterParamsForRoute<Source>, ErrorMode>
    : Source extends AnyRouter
      ? ClientRoutes<ClientContractFor<Source>, RouterChildrenFor<Source>, ErrorMode>
      : never

export type ClientOptions<
  Context extends object,
  ContractType extends Contract = Contract,
  ErrorMode extends ClientErrorMode = 'return',
> = {
  readonly transport: ClientTransport
  readonly headers?: ClientHeaders
  readonly context?: ClientContextFactory<Context, ContractType>
  readonly middleware?: readonly ClientMiddleware<Context, ContractType>[]
  readonly errorMode?: ErrorMode
}

export type Client<
  ContractType extends Contract = Contract,
  ErrorMode extends ClientErrorMode = 'return',
> = ClientRoutes<ContractType, ContractType['routes'], ErrorMode>
