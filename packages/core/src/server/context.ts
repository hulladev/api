import type { Contract, ContractRoute, ContractRoutes } from '../contract'
import type { JoinRoutePaths } from '../paths'
import type { Route, RouteMap } from '../route'
import type { Router } from '../router'

export type Awaitable<Value> = PromiseLike<Value> | Value

export type RouteMetadata<
  Key extends readonly string[] = readonly string[],
  Method extends Route['method'] = Route['method'],
  Path extends string = string,
> = {
  readonly key: Key
  readonly method: Method
  readonly path: Path
}

type StringKey<Value> = Extract<keyof Value, string>

type RouterRouteMetadata<
  BasePath extends string,
  RouterKey extends string,
  RouterPath extends string,
  Routes extends RouteMap,
> = {
  readonly [RouteKey in StringKey<Routes>]: Routes[RouteKey] extends Route<infer Method, infer RoutePath>
    ? RouteMetadata<readonly [RouterKey, RouteKey], Method, JoinRoutePaths<readonly [BasePath, RouterPath, RoutePath]>>
    : never
}[StringKey<Routes>]

type MetadataForDefinition<BasePath extends string, Key extends string, Definition extends ContractRoute> =
  Definition extends Route<infer Method, infer RoutePath>
    ? RouteMetadata<readonly [Key], Method, JoinRoutePaths<readonly [BasePath, RoutePath]>>
    : Definition extends Router<infer RouterPath, infer Routes>
      ? RouterRouteMetadata<BasePath, Key, RouterPath, Routes>
      : never

type ContractRouteMetadata<BasePath extends string, Routes extends ContractRoutes> = {
  readonly [Key in StringKey<Routes>]: MetadataForDefinition<BasePath, Key, Routes[Key]>
}[StringKey<Routes>]

export type ServerRouteMetadata<ContractType extends Contract = Contract> = ContractRouteMetadata<
  ContractType['basePath'],
  ContractType['routes']
>

export type ContextFactory<Input, Context extends object> = (input: Input) => Awaitable<Context>

export type ServerContextInput<ContractType extends Contract = Contract> = {
  readonly request: Request
  readonly route: ServerRouteMetadata<ContractType>
}

export type ServerContextFactory<
  Context extends object = object,
  ContractType extends Contract = Contract,
> = ContextFactory<ServerContextInput<ContractType>, Context>
