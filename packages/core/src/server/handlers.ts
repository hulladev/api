import type { Contract, ContractNodeFor, ContractNodeKey, ContractRoute, ContractRoutes } from '../contract'
import type { RouteInput } from '../contract/input'
import type { JoinRoutePaths } from '../contract/paths'
import type { Route } from '../contract/route'
import type { AnyRouter, RouterChildrenFor, RouterParamsForRoute } from '../contract/router'
import type { ErrorFactoryField, ErrorInstance, NormalizedErrorStatusMap } from '../declared-errors'
import type { ObjectSchema } from '../validation'
import type { Awaitable, RouteMetadata } from './context'
import type { ServerResponseFactory, ServerResponseResult } from './response'

export type ServerHandlerInput<
  RouteType extends Route,
  Context extends object,
  RouterParams extends ObjectSchema | undefined = undefined,
  Metadata extends RouteMetadata = RouteMetadata,
  Errors extends NormalizedErrorStatusMap = NormalizedErrorStatusMap,
> = {
  readonly signal: AbortSignal
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

type UnexpectedResponseKeys<Actual, Allowed> = Actual extends { readonly status: infer Status }
  ? Exclude<keyof Actual, keyof Extract<Allowed, { readonly status: Status }>>
  : never

type CheckedHandler<RouteType extends Route, Handler> =
  UnexpectedResponseKeys<HandlerReturn<Handler>, ServerResponseResult<RouteType['responses']>> extends never
    ? unknown
    : {
        readonly 'Handler response has unexpected properties': UnexpectedResponseKeys<
          HandlerReturn<Handler>,
          ServerResponseResult<RouteType['responses']>
        >
      }

type CheckedHandlerTree<Routes extends ContractRoutes, Fragment> = {
  readonly [Key in keyof Fragment]: Key extends keyof Routes
    ? Routes[Key] extends Route
      ? CheckedHandler<Routes[Key], Fragment[Key]>
      : Routes[Key] extends AnyRouter
        ? CheckedHandlerTree<RouterChildrenFor<Routes[Key]>, Fragment[Key]>
        : never
    : never
}

export type ContractHandlerKey<Routes extends ContractRoutes, Prefix extends readonly string[] = readonly []> = {
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

export type NodeHandlers<ContractType extends Contract, Context extends object, Node> = HandlerAtKey<
  ServerHandlers<ContractType['routes'], Context, ContractType['basePath'], ContractType['errors']>,
  ContractNodeKey<Node>
>

export type CheckedNodeHandlers<Node, Handlers> = Node extends Contract
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

export type NodeHandlerKey<ContractType extends Contract, Node> = HandlerKeyAtPrefix<
  ContractHandlerKey<ContractType['routes']>,
  ContractNodeKey<Node>
>
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
