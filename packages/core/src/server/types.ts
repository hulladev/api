import type { Contract, ContractNodeFor } from '../contract'
import type { ServerContextFactory } from './context'
import type { CheckedNodeHandlers, ContractHandlerKey, NodeHandlerKey, NodeHandlers, ServerHandlers } from './handlers'
import type { ServerHandlerBinding } from './implementation'
import type { ServerMiddleware, ServerMiddlewareCandidate } from './middleware'

declare const serverFragmentKey: unique symbol

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
  AdapterId extends string | undefined,
  AdapterInput extends object,
  Fragments extends readonly ServerImplementationFragment<
    ContractType,
    Context,
    readonly string[],
    unknown,
    ContractNodeFor<ContractType>,
    AdapterId,
    AdapterInput
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

export type DefineServerOptions<
  Context extends object,
  ContractType extends Contract = Contract,
  AdapterId extends string | undefined = undefined,
  AdapterInput extends object = object,
> = {
  readonly context?: ServerContextFactory<Context, ContractType, AdapterId, AdapterInput>
}

export type ServerImplementation<
  ContractType extends Contract = Contract,
  Context extends object = object,
  AdapterId extends string | undefined = undefined,
  AdapterInput extends object = object,
> = {
  readonly contract: ContractType
  readonly bindings: readonly ServerHandlerBinding[]
  readonly handlers: ServerHandlers<ContractType['routes'], Context, ContractType['basePath'], ContractType['errors']>
  readonly context: DefineServerOptions<Context, ContractType, AdapterId, AdapterInput>['context']
  readonly middlewares: readonly ServerMiddleware<Context, ContractType>[]
}

export type ServerImplementationFragment<
  ContractType extends Contract = Contract,
  Context extends object = object,
  Key extends readonly string[] = readonly string[],
  Handlers = unknown,
  Node extends ContractNodeFor<ContractType> = ContractNodeFor<ContractType>,
  AdapterId extends string | undefined = undefined,
  AdapterInput extends object = object,
> = {
  readonly contract: ContractType
  readonly bindings: readonly ServerHandlerBinding[]
  readonly handlers: Handlers
  readonly node: Node
  readonly context: DefineServerOptions<Context, ContractType, AdapterId, AdapterInput>['context']
  readonly middlewares: readonly ServerMiddleware<Context, ContractType>[]
  /** Type-only union of the structurally selected handler keys. */
  readonly [serverFragmentKey]?: Key
}

export type ServerExecutable<
  ContractType extends Contract = Contract,
  Context extends object = object,
  AdapterId extends string | undefined = undefined,
  AdapterInput extends object = object,
> =
  | ServerImplementation<ContractType, Context, AdapterId, AdapterInput>
  | ServerImplementationFragment<
      ContractType,
      Context,
      readonly string[],
      unknown,
      ContractNodeFor<ContractType>,
      AdapterId,
      AdapterInput
    >

export type ServerExecutableFor<
  ContractType extends Contract,
  Context extends object,
  AdapterId extends string,
  AdapterInput extends object = object,
> =
  | ServerExecutable<ContractType, Context, undefined>
  | ServerExecutable<ContractType, Context, AdapterId, AdapterInput>

export type Server<
  ContractType extends Contract = Contract,
  Context extends object = object,
  AdapterId extends string | undefined = undefined,
  AdapterInput extends object = object,
> = ServerImplementation<ContractType, Context, AdapterId, AdapterInput>

export type ServerDefinition<
  ContractType extends Contract,
  Context extends object,
  AdapterId extends string | undefined = undefined,
  AdapterInput extends object = object,
> = {
  readonly contract: ContractType
  readonly context: DefineServerOptions<Context, ContractType, AdapterId, AdapterInput>['context']
  readonly middlewares: readonly ServerMiddleware<Context, ContractType>[]
  readonly middleware: <const Handler extends ServerMiddlewareCandidate<NoInfer<Context>, NoInfer<ContractType>>>(
    middleware: Handler
  ) => Handler
  readonly use: {
    <const Middleware extends ServerMiddlewareCandidate<NoInfer<Context>, NoInfer<ContractType>>>(
      middleware: Middleware
    ): ServerDefinition<ContractType, Context, AdapterId, AdapterInput>
    <
      const Node extends Exclude<ContractNodeFor<ContractType>, ContractType>,
      const Middleware extends ServerMiddlewareCandidate<NoInfer<Context>, NoInfer<ContractType>>,
    >(
      node: Node,
      middleware: Middleware
    ): ServerDefinition<ContractType, Context, AdapterId, AdapterInput>
  }
  readonly implement: {
    <const Handlers extends NodeHandlers<ContractType, Context, ContractType>>(
      handlers: Handlers & CheckedNodeHandlers<ContractType, Handlers>
    ): ServerImplementation<ContractType, Context, AdapterId, AdapterInput>
    <
      const Node extends Exclude<ContractNodeFor<ContractType>, ContractType>,
      const Handlers extends NodeHandlers<ContractType, Context, Node>,
    >(
      node: Node,
      handlers: Handlers & CheckedNodeHandlers<Node, Handlers>
    ): ServerImplementationFragment<
      ContractType,
      Context,
      NodeHandlerKey<ContractType, Node>,
      Handlers,
      Node,
      AdapterId,
      AdapterInput
    >
  }
  readonly compose: {
    <
      const Fragments extends readonly [
        ServerImplementationFragment<
          ContractType,
          Context,
          readonly string[],
          unknown,
          ContractNodeFor<ContractType>,
          AdapterId,
          AdapterInput
        >,
        ...ServerImplementationFragment<
          ContractType,
          Context,
          readonly string[],
          unknown,
          ContractNodeFor<ContractType>,
          AdapterId,
          AdapterInput
        >[],
      ],
    >(
      ...fragments: CompleteImplementationFragments<ContractType, Context, AdapterId, AdapterInput, Fragments>
    ): ServerImplementation<ContractType, Context, AdapterId, AdapterInput>
  }
}

export type ServerHandlersOf<Definition> =
  Definition extends ServerDefinition<infer ContractType, infer Context, infer _Adapter>
    ? ServerHandlers<ContractType['routes'], Context, ContractType['basePath'], ContractType['errors']>
    : never
