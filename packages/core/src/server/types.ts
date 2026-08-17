import type { Contract, ContractRoute, ContractRoutes } from '../contract'
import type { RouteInput } from '../input'
import type { JoinRoutePaths } from '../paths'
import type { Route } from '../route'
import type { Router } from '../router'
import type { ObjectSchema } from '../validation'
import type { Awaitable, RouteMetadata, ServerContextFactory } from './context'
import type { ServerMiddleware, ServerMiddlewareCandidate } from './middleware'
import type { ServerResponseResult } from './response'

export type ServerHandlerInput<
  RouteType extends Route,
  Context extends object,
  RouterParams extends ObjectSchema | undefined = undefined,
  Metadata extends RouteMetadata = RouteMetadata,
> = {
  readonly context: Readonly<Context>
  readonly request: Request
  readonly route: Metadata
} & RouteInput<RouteType, RouterParams>

export type ServerHandler<
  RouteType extends Route,
  Context extends object,
  RouterParams extends ObjectSchema | undefined = undefined,
  Metadata extends RouteMetadata = RouteMetadata,
> = (
  input: ServerHandlerInput<RouteType, Context, RouterParams, Metadata>
) => Awaitable<ServerResponseResult<RouteType['responses']>>

type HandlerTree<
  Routes extends Readonly<Record<string, ContractRoute>>,
  Context extends object,
  BasePath extends string,
  RouterParams extends ObjectSchema | undefined = undefined,
  KeyPrefix extends readonly string[] = readonly [],
  PathPrefix extends readonly string[] = readonly [BasePath],
> = {
  readonly [Key in keyof Routes]: Routes[Key] extends Route
    ? ServerHandler<
        Routes[Key],
        Context,
        RouterParams,
        RouteMetadata<
          readonly [...KeyPrefix, Key & string],
          Routes[Key]['method'],
          JoinRoutePaths<readonly [...PathPrefix, Routes[Key]['path']]>
        >
      >
    : Routes[Key] extends Router<infer RouterPath, infer NestedRoutes, infer NestedParams>
      ? HandlerTree<
          NestedRoutes,
          Context,
          BasePath,
          NestedParams,
          readonly [...KeyPrefix, Key & string],
          readonly [...PathPrefix, RouterPath]
        >
      : never
}

type HandlerReturn<Handler> = Handler extends (...args: never[]) => infer Result ? Awaited<Result> : never

type ResponseStatus<Value> = Value extends { readonly status: infer Status extends number } ? Status : never

type ReturnedStatuses<Handler> = ResponseStatus<HandlerReturn<Handler>>

type DeclaredStatuses<RouteType extends Route> = ResponseStatus<ServerResponseResult<RouteType['responses']>>

type UnexpectedResponseKeys<Actual, Allowed> = Actual extends { readonly status: infer Status }
  ? Exclude<keyof Actual, keyof Extract<Allowed, { readonly status: Status }>>
  : keyof Actual

type CheckedHandler<RouteType extends Route, Handler> = (Exclude<
  DeclaredStatuses<RouteType>,
  ReturnedStatuses<Handler>
> extends never
  ? unknown
  : {
      readonly 'Handler must return every declared response': Exclude<
        DeclaredStatuses<RouteType>,
        ReturnedStatuses<Handler>
      >
    }) &
  (UnexpectedResponseKeys<HandlerReturn<Handler>, ServerResponseResult<RouteType['responses']>> extends never
    ? unknown
    : {
        readonly 'Handler response has unexpected properties': UnexpectedResponseKeys<
          HandlerReturn<Handler>,
          ServerResponseResult<RouteType['responses']>
        >
      })

type CheckedHandlerTree<Routes extends ContractRoutes, Fragment> = {
  readonly [Key in keyof Fragment]: Key extends keyof Routes
    ? Routes[Key] extends Route
      ? CheckedHandler<Routes[Key], Fragment[Key]>
      : Routes[Key] extends Router<string, infer NestedRoutes>
        ? CheckedHandlerTree<NestedRoutes, Fragment[Key]>
        : never
    : never
}

export type ServerHandlers<
  Routes extends ContractRoutes,
  Context extends object,
  BasePath extends string = string,
> = HandlerTree<Routes, Context, BasePath>

export type DefineServerOptions<Context extends object, ContractType extends Contract = Contract> = {
  readonly context?: ServerContextFactory<Context, ContractType>
}

export type ServerImplementation<ContractType extends Contract = Contract, Context extends object = object> = {
  readonly contract: ContractType
  readonly handlers: ServerHandlers<ContractType['routes'], Context, ContractType['basePath']>
  readonly context: DefineServerOptions<Context, ContractType>['context']
  readonly middlewares: readonly ServerMiddleware<Context, ContractType>[]
}

export type Server<ContractType extends Contract = Contract, Context extends object = object> = ServerImplementation<
  ContractType,
  Context
>

export type ServerDefinition<ContractType extends Contract, Context extends object> = {
  readonly contract: ContractType
  readonly context: DefineServerOptions<Context, ContractType>['context']
  readonly middlewares: readonly ServerMiddleware<Context, ContractType>[]
  readonly middleware: <const Handler extends ServerMiddlewareCandidate<NoInfer<Context>, NoInfer<ContractType>>>(
    middleware: Handler
  ) => Handler
  readonly use: <
    const Middlewares extends readonly ServerMiddlewareCandidate<NoInfer<Context>, NoInfer<ContractType>>[],
  >(
    ...middlewares: Middlewares
  ) => ServerDefinition<ContractType, Context>
  readonly build: <const Handlers extends ServerHandlers<ContractType['routes'], Context, ContractType['basePath']>>(
    handlers: Handlers & CheckedHandlerTree<ContractType['routes'], Handlers>
  ) => ServerImplementation<ContractType, Context>
}

export type ServerHandlersOf<Definition> =
  Definition extends ServerDefinition<infer ContractType, infer Context>
    ? ServerHandlers<ContractType['routes'], Context, ContractType['basePath']>
    : never
