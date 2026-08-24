import type { Contract, ContractNodeFor, ContractNodeKey, ContractRoutes } from '../contract'
import type { ClientErrorMode, ClientErrorResponseResult } from '../declared-errors'
import type { RouteInputSource } from '../input'
import type { RouteResponses } from '../response'
import type { Route } from '../route'
import type { AnyRouter, RouterChildrenFor, RouterParamsForRoute } from '../router'
import type { ObjectSchema } from '../validation'
import type { ClientContextFactory } from './context'
import type { ClientMiddleware, ClientMiddlewareCandidate } from './middleware'
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

type ContractClientRouteKey<Routes extends ContractRoutes, Prefix extends readonly string[] = readonly []> = {
  [Key in keyof Routes]: Routes[Key] extends Route
    ? readonly [...Prefix, Key & string]
    : Routes[Key] extends AnyRouter
      ? ContractClientRouteKey<RouterChildrenFor<Routes[Key]>, readonly [...Prefix, Key & string]>
      : never
}[keyof Routes]

type KeyStartsWith<Key, Prefix extends readonly string[]> = Prefix extends readonly []
  ? true
  : Prefix extends readonly [infer PrefixHead, ...infer PrefixTail extends readonly string[]]
    ? Key extends readonly [infer KeyHead, ...infer KeyTail extends readonly string[]]
      ? [KeyHead, PrefixHead] extends [PrefixHead, KeyHead]
        ? KeyStartsWith<KeyTail, PrefixTail>
        : false
      : false
    : false

type ClientRouteKeyAtPrefix<Key, Prefix extends readonly string[]> = Key extends unknown
  ? KeyStartsWith<Key, Prefix> extends true
    ? Key
    : never
  : never

type ClientNodeRouteKey<ContractType extends Contract, Node> = ClientRouteKeyAtPrefix<
  ContractClientRouteKey<ContractType['routes']>,
  ContractNodeKey<Node>
>

type ClientValueAtKey<Value, Key extends readonly string[]> = Key extends readonly []
  ? Value
  : Key extends readonly [infer Head extends keyof Value, ...infer Tail extends readonly string[]]
    ? ClientValueAtKey<Value[Head], Tail>
    : never

declare const clientFragmentType: unique symbol

export type ClientRoutesForNode<
  ContractType extends Contract,
  Node extends ContractNodeFor<ContractType>,
  ErrorMode extends ClientErrorMode = 'return',
> = ClientValueAtKey<ClientRoutes<ContractType, ContractType['routes'], ErrorMode>, ContractNodeKey<Node>>

export type ClientFragment<
  ContractType extends Contract = Contract,
  Context extends object = object,
  Key extends readonly string[] = readonly string[],
  Node extends ContractNodeFor<ContractType> = ContractNodeFor<ContractType>,
  ErrorMode extends ClientErrorMode = 'return',
> = ClientRoutesForNode<ContractType, Node, ErrorMode> & {
  readonly [clientFragmentType]: {
    readonly context: Context
    readonly key: Key
  }
}

type FragmentKey<Fragment> =
  Fragment extends ClientFragment<infer _Contract, infer _Context, infer Key, infer _Node, infer _ErrorMode>
    ? Key
    : never

type CompleteClientFragments<
  ContractType extends Contract,
  Context extends object,
  ErrorMode extends ClientErrorMode,
  Fragments extends readonly ClientFragment<
    ContractType,
    Context,
    readonly string[],
    ContractNodeFor<ContractType>,
    ErrorMode
  >[],
> =
  Exclude<ContractClientRouteKey<ContractType['routes']>, FragmentKey<Fragments[number]>> extends never
    ? Fragments
    : Fragments & {
        readonly 'Missing client routes': Exclude<
          ContractClientRouteKey<ContractType['routes']>,
          FragmentKey<Fragments[number]>
        >
      }

export type DefineClientOptions<
  Context extends object,
  ContractType extends Contract = Contract,
  ErrorMode extends ClientErrorMode = 'return',
> = {
  readonly transport: ClientTransport
  readonly headers?: ClientHeaders
  readonly context?: ClientContextFactory<Context, ContractType>
  readonly errorMode?: ErrorMode
}

export type ClientDefinition<
  ContractType extends Contract,
  Context extends object,
  ErrorMode extends ClientErrorMode = 'return',
> = {
  readonly contract: ContractType
  readonly context: ClientContextFactory<Context, ContractType> | undefined
  readonly middlewares: readonly ClientMiddleware<Context, ContractType>[]
  readonly middleware: <const Handler extends ClientMiddlewareCandidate<NoInfer<Context>, NoInfer<ContractType>>>(
    middleware: Handler
  ) => Handler
  readonly use: {
    <const Middleware extends ClientMiddlewareCandidate<NoInfer<Context>, NoInfer<ContractType>>>(
      middleware: Middleware
    ): ClientDefinition<ContractType, Context, ErrorMode>
    <
      const Node extends Exclude<ContractNodeFor<ContractType>, ContractType>,
      const Middleware extends ClientMiddlewareCandidate<NoInfer<Context>, NoInfer<ContractType>>,
    >(
      node: Node,
      middleware: Middleware
    ): ClientDefinition<ContractType, Context, ErrorMode>
  }
  readonly create: {
    (): ClientRoutes<ContractType, ContractType['routes'], ErrorMode>
    <const Node extends Exclude<ContractNodeFor<ContractType>, ContractType>>(
      node: Node
    ): ClientFragment<ContractType, Context, ClientNodeRouteKey<ContractType, Node>, Node, ErrorMode>
    <
      const Fragments extends readonly [
        ClientFragment<ContractType, Context, readonly string[], ContractNodeFor<ContractType>, ErrorMode>,
        ...ClientFragment<ContractType, Context, readonly string[], ContractNodeFor<ContractType>, ErrorMode>[],
      ],
    >(
      ...fragments: CompleteClientFragments<ContractType, Context, ErrorMode, Fragments>
    ): ClientRoutes<ContractType, ContractType['routes'], ErrorMode>
  }
}

export type Client<
  ContractType extends Contract = Contract,
  ErrorMode extends ClientErrorMode = 'return',
> = ClientRoutes<ContractType, ContractType['routes'], ErrorMode>
