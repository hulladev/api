import type { Contract, ContractRoute, ContractRoutes } from '../contract'
import type { RouteInput } from '../input'
import type { JoinRoutePaths } from '../paths'
import type { Route } from '../route'
import type { Router } from '../router'
import type { ObjectSchema } from '../validation'
import type { Awaitable, RouteMetadata, ServerContextFactory } from './context'
import type { ServerMiddleware, ServerMiddlewareCandidate, ServerMiddlewareErrorStatuses } from './middleware'
import type {
  ProducedServerResponse,
  ProducedServerResponseValue,
  ServerResponder,
  ServerResponseResult,
} from './response'

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

export type ServerHandlerActions<RouteType extends Route> = {
  readonly respond: ServerResponder<ServerResponseResult<RouteType['responses']>>
}

export type ServerHandler<
  RouteType extends Route,
  Context extends object,
  RouterParams extends ObjectSchema | undefined = undefined,
  Metadata extends RouteMetadata = RouteMetadata,
> = (
  actions: ServerHandlerActions<RouteType>,
  args: ServerHandlerInput<RouteType, Context, RouterParams, Metadata>
) => Awaitable<ProducedServerResponse<ServerResponseResult<RouteType['responses']>>>

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

type PartialHandlerTree<
  Routes extends Readonly<Record<string, ContractRoute>>,
  Context extends object,
  BasePath extends string,
  RouterParams extends ObjectSchema | undefined = undefined,
  KeyPrefix extends readonly string[] = readonly [],
  PathPrefix extends readonly string[] = readonly [BasePath],
> = {
  readonly [Key in keyof Routes]?: Routes[Key] extends Route
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
      ? PartialHandlerTree<
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

type ReturnedStatuses<Handler> = ResponseStatus<ProducedServerResponseValue<HandlerReturn<Handler>>>

type DeclaredStatuses<RouteType extends Route> = ResponseStatus<ServerResponseResult<RouteType['responses']>>

type CheckedHandler<RouteType extends Route, Handler> =
  Exclude<DeclaredStatuses<RouteType>, ReturnedStatuses<Handler>> extends never
    ? unknown
    : {
        readonly 'Handler must return every declared response': Exclude<
          DeclaredStatuses<RouteType>,
          ReturnedStatuses<Handler>
        >
      }

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

export type PartialServerHandlers<
  Routes extends ContractRoutes,
  Context extends object,
  BasePath extends string = string,
> = PartialHandlerTree<Routes, Context, BasePath>

type StringKey<Value> = Extract<keyof Value, string>

type RouteKeys<Routes extends ContractRoutes, Prefix extends string = ''> = {
  readonly [Key in StringKey<Routes>]: Routes[Key] extends Route
    ? `${Prefix}${Key}`
    : Routes[Key] extends Router<string, infer NestedRoutes>
      ? RouteKeys<NestedRoutes, `${Prefix}${Key}.`>
      : never
}[StringKey<Routes>]

type FragmentRouteKeys<
  Routes extends ContractRoutes,
  Fragment,
  Prefix extends string = '',
  Key extends StringKey<Fragment> & StringKey<Routes> = StringKey<Fragment> & StringKey<Routes>,
> = {
  readonly [CurrentKey in Key]: Routes[CurrentKey] extends Route
    ? `${Prefix}${CurrentKey}`
    : Routes[CurrentKey] extends Router<string, infer NestedRoutes>
      ? Fragment[CurrentKey] extends object
        ? FragmentRouteKeys<NestedRoutes, Fragment[CurrentKey], `${Prefix}${CurrentKey}.`>
        : never
      : never
}[Key]

declare const handlerFragmentType: unique symbol

export type HandlerFragment<
  ContractType extends Contract,
  Context extends object,
  MiddlewareStatuses extends number = never,
  Keys extends string = RouteKeys<ContractType['routes']>,
  Handlers extends object = object,
> = Readonly<Handlers> & {
  readonly [handlerFragmentType]: {
    readonly contract: ContractType
    readonly context: Context
    readonly middlewareStatuses: MiddlewareStatuses
    readonly keys: Keys
  }
}

type FragmentKeys<Fragment> = Fragment extends {
  readonly [handlerFragmentType]: { readonly keys: infer Keys extends string }
}
  ? Keys
  : never

type FragmentMiddlewareStatuses<Fragment> = Fragment extends {
  readonly [handlerFragmentType]: { readonly middlewareStatuses: infer Status extends number }
}
  ? Status
  : never

type ImplementedKeys<Fragments extends readonly unknown[]> = FragmentKeys<Fragments[number]>

type DuplicateKeys<Fragments extends readonly unknown[], Seen extends string = never> = Fragments extends readonly [
  infer Head,
  ...infer Tail,
]
  ? Extract<FragmentKeys<Head>, Seen> | DuplicateKeys<Tail, Seen | FragmentKeys<Head>>
  : never

type MissingKeys<ContractType extends Contract, Fragments extends readonly unknown[]> = Exclude<
  RouteKeys<ContractType['routes']>,
  ImplementedKeys<Fragments>
>

type CheckedFragments<ContractType extends Contract, Fragments extends readonly unknown[]> = [
  MissingKeys<ContractType, Fragments>,
] extends [never]
  ? [DuplicateKeys<Fragments>] extends [never]
    ? unknown
    : { readonly 'Duplicate handlers': DuplicateKeys<Fragments> }
  : { readonly 'Missing handlers': MissingKeys<ContractType, Fragments> }

type CheckedFragmentTypes<ContractType extends Contract, Context extends object, Fragments extends readonly unknown[]> =
  Exclude<Fragments[number], HandlerFragment<ContractType, Context, number, string, object>> extends never
    ? unknown
    : {
        readonly 'Invalid handler fragments': Exclude<
          Fragments[number],
          HandlerFragment<ContractType, Context, number, string, object>
        >
      }

export type DefineServerOptions<Context extends object, ContractType extends Contract = Contract> = {
  readonly context?: ServerContextFactory<Context, ContractType>
}

export type ServerImplementation<
  ContractType extends Contract = Contract,
  Context extends object = object,
  Fragments extends readonly unknown[] = readonly HandlerFragment<
    ContractType,
    Context,
    Extract<keyof ContractType['errors'], number>
  >[],
> = {
  readonly contract: ContractType
  readonly handlers: ServerHandlers<ContractType['routes'], Context, ContractType['basePath']>
  readonly context: DefineServerOptions<Context, ContractType>['context']
  readonly middlewares: ServerMiddlewareTree<ContractType['routes'], Context, ContractType, Fragments>
}

export type Server<ContractType extends Contract = Contract, Context extends object = object> = ServerImplementation<
  ContractType,
  Context
>

type MiddlewareStatusesForKey<Fragment, Key extends string> = Fragment extends unknown
  ? Key extends FragmentKeys<Fragment>
    ? FragmentMiddlewareStatuses<Fragment>
    : never
  : never

export type ServerMiddlewareTree<
  Routes extends ContractRoutes,
  Context extends object,
  ContractType extends Contract,
  Fragments extends readonly unknown[] = readonly HandlerFragment<
    ContractType,
    Context,
    Extract<keyof ContractType['errors'], number>
  >[],
  Prefix extends string = '',
> = {
  readonly [Key in keyof Routes]: Routes[Key] extends Route
    ? readonly ServerMiddleware<
        Context,
        ContractType,
        Extract<
          MiddlewareStatusesForKey<Fragments[number], `${Prefix}${Key & string}`>,
          Extract<keyof ContractType['errors'], number>
        >
      >[]
    : Routes[Key] extends Router<string, infer NestedRoutes>
      ? ServerMiddlewareTree<NestedRoutes, Context, ContractType, Fragments, `${Prefix}${Key & string}.`>
      : never
}

export type ServerDefinition<
  ContractType extends Contract,
  Context extends object,
  MiddlewareStatuses extends number = never,
> = {
  readonly contract: ContractType
  readonly context: DefineServerOptions<Context, ContractType>['context']
  readonly middlewares: readonly ServerMiddleware<
    Context,
    ContractType,
    Extract<MiddlewareStatuses, Extract<keyof ContractType['errors'], number>>
  >[]
  readonly middleware: <const Handler extends ServerMiddlewareCandidate<NoInfer<Context>, NoInfer<ContractType>>>(
    middleware: Handler
  ) => Handler
  readonly use: <
    const Middlewares extends readonly ServerMiddlewareCandidate<NoInfer<Context>, NoInfer<ContractType>>[],
  >(
    ...middlewares: Middlewares
  ) => ServerDefinition<ContractType, Context, MiddlewareStatuses | ServerMiddlewareErrorStatuses<Middlewares[number]>>
  readonly implement: <
    const Fragment extends PartialServerHandlers<ContractType['routes'], Context, ContractType['basePath']>,
  >(
    handlers: Fragment & CheckedHandlerTree<ContractType['routes'], Fragment>
  ) => HandlerFragment<
    ContractType,
    Context,
    MiddlewareStatuses,
    FragmentRouteKeys<ContractType['routes'], Fragment>,
    Fragment
  >
  readonly build: <const Fragments extends readonly unknown[]>(
    ...fragments: Fragments &
      CheckedFragmentTypes<ContractType, Context, Fragments> &
      CheckedFragments<ContractType, Fragments>
  ) => ServerImplementation<ContractType, Context, Fragments>
}
