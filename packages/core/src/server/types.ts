import type { Contract, ContractNodeFor, ContractNodeKey, ContractRoute, ContractRoutes } from '../contract'
import type { ErrorFactoryField, ErrorInstance, NormalizedErrorStatusMap } from '../declared-errors'
import type { RouteInput } from '../input'
import type { JoinRoutePaths } from '../paths'
import type { Route } from '../route'
import type { AnyRouter, RouterChildrenFor, RouterParamsForRoute } from '../router'
import type { ObjectSchema } from '../validation'
import type { ServerAdapter } from './adapter'
import type { Awaitable, RouteMetadata, ServerContextFactory } from './context'
import type { ServerMiddleware, ServerMiddlewareCandidate } from './middleware'
import type { ServerResponseFactory, ServerResponseResult } from './response'

export type ServerHandlerInput<
  RouteType extends Route,
  Context extends object,
  RouterParams extends ObjectSchema | undefined = undefined,
  Metadata extends RouteMetadata = RouteMetadata,
  Errors extends NormalizedErrorStatusMap = NormalizedErrorStatusMap,
> = {
  readonly context: Readonly<Context>
  readonly response: ServerResponseFactory<RouteType['responses']>
  readonly route: Metadata
} & ErrorFactoryField<Errors> &
  RouteInput<RouteType, RouterParams>

export type ServerHandler<
  RouteType extends Route,
  Context extends object,
  RouterParams extends ObjectSchema | undefined = undefined,
  Metadata extends RouteMetadata = RouteMetadata,
  Errors extends NormalizedErrorStatusMap = NormalizedErrorStatusMap,
> = (
  input: ServerHandlerInput<RouteType, Context, RouterParams, Metadata, Errors>
) => Awaitable<ServerResponseResult<RouteType['responses']> | ErrorInstance<Errors>>

type HandlerTree<
  Routes extends Readonly<Record<string, ContractRoute>>,
  Context extends object,
  BasePath extends string,
  Errors extends NormalizedErrorStatusMap,
  KeyPrefix extends readonly string[] = readonly [],
  PathPrefix extends readonly string[] = readonly [BasePath],
> = {
  readonly [Key in keyof Routes]: Routes[Key] extends Route
    ? ServerHandler<
        Routes[Key],
        Context,
        RouterParamsForRoute<Routes[Key]>,
        RouteMetadata<
          readonly [...KeyPrefix, Key & string],
          Routes[Key]['method'],
          JoinRoutePaths<readonly [...PathPrefix, Routes[Key]['path']]>
        >,
        Errors
      >
    : Routes[Key] extends AnyRouter
      ? HandlerTree<
          RouterChildrenFor<Routes[Key]>,
          Context,
          BasePath,
          Errors,
          readonly [...KeyPrefix, Key & string],
          readonly [...PathPrefix, Routes[Key]['$meta']['path']]
        >
      : never
}

type HandlerFragmentTree<
  Routes extends Readonly<Record<string, ContractRoute>>,
  Context extends object,
  BasePath extends string,
  Errors extends NormalizedErrorStatusMap,
  KeyPrefix extends readonly string[] = readonly [],
  PathPrefix extends readonly string[] = readonly [BasePath],
> = {
  readonly [Key in keyof Routes]?: Routes[Key] extends Route
    ? ServerHandler<
        Routes[Key],
        Context,
        RouterParamsForRoute<Routes[Key]>,
        RouteMetadata<
          readonly [...KeyPrefix, Key & string],
          Routes[Key]['method'],
          JoinRoutePaths<readonly [...PathPrefix, Routes[Key]['path']]>
        >,
        Errors
      >
    : Routes[Key] extends AnyRouter
      ? HandlerFragmentTree<
          RouterChildrenFor<Routes[Key]>,
          Context,
          BasePath,
          Errors,
          readonly [...KeyPrefix, Key & string],
          readonly [...PathPrefix, Routes[Key]['$meta']['path']]
        >
      : never
}

type HandlerReturn<Handler> = Handler extends (...args: never[]) => infer Result ? Awaited<Result> : never

type ResponseStatus<Value> = Value extends { readonly status: infer Status extends number } ? Status : never

type ReturnedStatuses<Handler> = ResponseStatus<HandlerReturn<Handler>>

type DeclaredStatuses<RouteType extends Route> = ResponseStatus<ServerResponseResult<RouteType['responses']>>

type UnexpectedResponseKeys<Actual, Allowed> = Actual extends { readonly status: infer Status }
  ? Exclude<keyof Actual, keyof Extract<Allowed, { readonly status: Status }>>
  : never

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
      : Routes[Key] extends AnyRouter
        ? CheckedHandlerTree<RouterChildrenFor<Routes[Key]>, Fragment[Key]>
        : never
    : never
}

type ContractHandlerKey<Routes extends ContractRoutes, Prefix extends readonly string[] = readonly []> = {
  [Key in keyof Routes]: Routes[Key] extends Route
    ? readonly [...Prefix, Key & string]
    : Routes[Key] extends AnyRouter
      ? ContractHandlerKey<RouterChildrenFor<Routes[Key]>, readonly [...Prefix, Key & string]>
      : never
}[keyof Routes]

type HandlerAtKey<Tree, Key extends readonly string[]> = Key extends readonly []
  ? Tree
  : Key extends readonly [infer Head extends keyof Tree, ...infer Tail extends readonly string[]]
    ? HandlerAtKey<Tree[Head], Tail>
    : never

type NodeHandlers<ContractType extends Contract, Context extends object, Node> = HandlerAtKey<
  ServerHandlers<ContractType['routes'], Context, ContractType['basePath'], ContractType['errors']>,
  ContractNodeKey<Node>
>

type CheckedNodeHandlers<Node, Handlers> = Node extends Contract
  ? CheckedHandlerTree<Node['routes'], Handlers>
  : Node extends AnyRouter
    ? CheckedHandlerTree<RouterChildrenFor<Node>, Handlers>
    : Node extends Route
      ? CheckedHandler<Node, Handlers>
      : never

type KeyStartsWith<Key, Prefix extends readonly string[]> = Prefix extends readonly []
  ? true
  : Prefix extends readonly [infer PrefixHead, ...infer PrefixTail extends readonly string[]]
    ? Key extends readonly [infer KeyHead, ...infer KeyTail extends readonly string[]]
      ? [KeyHead, PrefixHead] extends [PrefixHead, KeyHead]
        ? KeyStartsWith<KeyTail, PrefixTail>
        : false
      : false
    : false

type HandlerKeyAtPrefix<Key, Prefix extends readonly string[]> = Key extends unknown
  ? KeyStartsWith<Key, Prefix> extends true
    ? Key
    : never
  : never

type NodeHandlerKey<ContractType extends Contract, Node> = HandlerKeyAtPrefix<
  ContractHandlerKey<ContractType['routes']>,
  ContractNodeKey<Node>
>

type FragmentKey<Fragment> =
  Fragment extends ServerImplementationFragment<
    infer _Contract,
    infer _Context,
    infer Key,
    infer _Handlers,
    infer _Node,
    infer _Adapter
  >
    ? Key
    : never

type CompleteImplementationFragments<
  ContractType extends Contract,
  Context extends object,
  Adapter extends ServerAdapter | undefined,
  Fragments extends readonly ServerImplementationFragment<
    ContractType,
    Context,
    readonly string[],
    unknown,
    ContractNodeFor<ContractType>,
    Adapter
  >[],
> =
  Exclude<ContractHandlerKey<ContractType['routes']>, FragmentKey<Fragments[number]>> extends never
    ? Fragments
    : Fragments & {
        readonly 'Missing server implementations': Exclude<
          ContractHandlerKey<ContractType['routes']>,
          FragmentKey<Fragments[number]>
        >
      }

export type ServerHandlers<
  Routes extends ContractRoutes,
  Context extends object,
  BasePath extends string = string,
  Errors extends NormalizedErrorStatusMap = NormalizedErrorStatusMap,
> = HandlerTree<Routes, Context, BasePath, Errors>

export type ServerHandlerFragment<
  Routes extends ContractRoutes,
  Context extends object,
  BasePath extends string = string,
  Errors extends NormalizedErrorStatusMap = NormalizedErrorStatusMap,
> = HandlerFragmentTree<Routes, Context, BasePath, Errors>

export type ServerHandlersForNode<
  ContractType extends Contract,
  Context extends object,
  Node extends ContractNodeFor<ContractType>,
> = NodeHandlers<ContractType, Context, Node>

export type DefineServerOptions<
  Context extends object,
  ContractType extends Contract = Contract,
  Adapter extends ServerAdapter | undefined = undefined,
> = {
  readonly adapter?: Adapter
  readonly context?: ServerContextFactory<Context, ContractType, Adapter>
}

export type ServerImplementation<
  ContractType extends Contract = Contract,
  Context extends object = object,
  Adapter extends ServerAdapter | undefined = undefined,
> = {
  readonly adapter: Adapter
  readonly contract: ContractType
  readonly handlers: ServerHandlers<ContractType['routes'], Context, ContractType['basePath'], ContractType['errors']>
  readonly context: DefineServerOptions<Context, ContractType, Adapter>['context']
  readonly middlewares: readonly ServerMiddleware<Context, ContractType>[]
}

export type ServerImplementationFragment<
  ContractType extends Contract = Contract,
  Context extends object = object,
  Key extends readonly string[] = readonly string[],
  Handlers = unknown,
  Node extends ContractNodeFor<ContractType> = ContractNodeFor<ContractType>,
  Adapter extends ServerAdapter | undefined = undefined,
> = {
  readonly adapter: Adapter
  readonly kind: 'server-implementation-fragment'
  readonly contract: ContractType
  readonly handlers: Handlers
  readonly node: Node
  readonly context: DefineServerOptions<Context, ContractType, Adapter>['context']
  readonly middlewares: readonly ServerMiddleware<Context, ContractType>[]
  /** Type-only union of the structurally selected handler keys. */
  readonly 'hulla.api.serverFragmentKey'?: Key
}

export type ServerExecutable<
  ContractType extends Contract = Contract,
  Context extends object = object,
  Adapter extends ServerAdapter | undefined = undefined,
> =
  | ServerImplementation<ContractType, Context, Adapter>
  | ServerImplementationFragment<
      ContractType,
      Context,
      readonly string[],
      unknown,
      ContractNodeFor<ContractType>,
      Adapter
    >

export type ServerExecutableFor<ContractType extends Contract, Context extends object, Adapter extends ServerAdapter> =
  | ServerExecutable<ContractType, Context, undefined>
  | ServerExecutable<ContractType, Context, Adapter>

export type Server<
  ContractType extends Contract = Contract,
  Context extends object = object,
  Adapter extends ServerAdapter | undefined = undefined,
> = ServerImplementation<ContractType, Context, Adapter>

export type ServerDefinition<
  ContractType extends Contract,
  Context extends object,
  Adapter extends ServerAdapter | undefined = undefined,
> = {
  readonly adapter: Adapter
  readonly contract: ContractType
  readonly context: DefineServerOptions<Context, ContractType, Adapter>['context']
  readonly middlewares: readonly ServerMiddleware<Context, ContractType>[]
  readonly middleware: <const Handler extends ServerMiddlewareCandidate<NoInfer<Context>, NoInfer<ContractType>>>(
    middleware: Handler
  ) => Handler
  readonly use: {
    <const Middleware extends ServerMiddlewareCandidate<NoInfer<Context>, NoInfer<ContractType>>>(
      middleware: Middleware
    ): ServerDefinition<ContractType, Context, Adapter>
    <
      const Node extends Exclude<ContractNodeFor<ContractType>, ContractType>,
      const Middleware extends ServerMiddlewareCandidate<NoInfer<Context>, NoInfer<ContractType>>,
    >(
      node: Node,
      middleware: Middleware
    ): ServerDefinition<ContractType, Context, Adapter>
  }
  readonly implement: {
    <const Handlers extends NodeHandlers<ContractType, Context, ContractType>>(
      handlers: Handlers & CheckedNodeHandlers<ContractType, Handlers>
    ): ServerImplementation<ContractType, Context, Adapter>
    <
      const Node extends Exclude<ContractNodeFor<ContractType>, ContractType>,
      const Handlers extends NodeHandlers<ContractType, Context, Node>,
    >(
      node: Node,
      handlers: Handlers & CheckedNodeHandlers<Node, Handlers>
    ): ServerImplementationFragment<ContractType, Context, NodeHandlerKey<ContractType, Node>, Handlers, Node, Adapter>
    <
      const Fragments extends readonly [
        ServerImplementationFragment<
          ContractType,
          Context,
          readonly string[],
          unknown,
          ContractNodeFor<ContractType>,
          Adapter
        >,
        ...ServerImplementationFragment<
          ContractType,
          Context,
          readonly string[],
          unknown,
          ContractNodeFor<ContractType>,
          Adapter
        >[],
      ],
    >(
      ...fragments: CompleteImplementationFragments<ContractType, Context, Adapter, Fragments>
    ): ServerImplementation<ContractType, Context, Adapter>
  }
}

export type ServerHandlersOf<Definition> =
  Definition extends ServerDefinition<infer ContractType, infer Context, infer _Adapter>
    ? ServerHandlers<ContractType['routes'], Context, ContractType['basePath'], ContractType['errors']>
    : never
