import type { Contract, ContractRoute } from './contract'
import { compileContractRoutes } from './contract-compiler'
import { getContractState } from './contract-state'
import type { HttpMethod } from './http'
import type { JoinRoutePaths } from './paths'
import type { Route } from './route'
import type { AnyRouter, Router } from './router'
import type { ObjectSchema } from './validation'

export type CompiledPathParameters = {
  /** The router or route path segment that declared these parameters. */
  readonly path: string
  readonly names: readonly string[]
  readonly schema: ObjectSchema
}

export type CompiledContractRoute<
  RouteType extends { readonly kind: 'route'; readonly method: HttpMethod; readonly path: string } = Route,
  Key extends readonly string[] = readonly string[],
  Path extends string = string,
> = {
  readonly key: Key
  readonly method: RouteType['method']
  readonly path: Path
  /** Parameter declarations ordered from the outermost router to the route. */
  readonly pathParameters: readonly CompiledPathParameters[]
  readonly route: RouteType
}

type StringKey<Value> = Extract<keyof Value, string>

type CompiledRouterRoute<
  BasePath extends string,
  RouterKey extends string,
  RouterPath extends string,
  RouterType extends AnyRouter,
> = {
  readonly [RouteKey in Exclude<StringKey<RouterType>, '$meta'>]: RouterType[RouteKey] extends Route<
    infer _Method,
    infer RoutePath
  >
    ? CompiledContractRoute<
        RouterType[RouteKey],
        readonly [RouterKey, RouteKey],
        JoinRoutePaths<readonly [BasePath, RouterPath, RoutePath]>
      >
    : never
}[Exclude<StringKey<RouterType>, '$meta'>]

type CompiledDefinition<BasePath extends string, Key extends string, Definition extends ContractRoute> =
  Definition extends Route<infer _Method, infer RoutePath>
    ? CompiledContractRoute<Definition, readonly [Key], JoinRoutePaths<readonly [BasePath, RoutePath]>>
    : Definition extends Router<infer RouterPath>
      ? CompiledRouterRoute<BasePath, Key, RouterPath, Definition>
      : never

export type CompiledContractRouteFor<ContractType extends Contract = Contract> = {
  readonly [Key in StringKey<ContractType['routes']>]: CompiledDefinition<
    ContractType['basePath'],
    Key,
    ContractType['routes'][Key]
  >
}[StringKey<ContractType['routes']>]

export type CompiledContract<ContractType extends Contract = Contract> = {
  readonly kind: 'compiled-contract'
  readonly contract: ContractType
  /** Routes in contract declaration order, with router children in their declaration order. */
  readonly routes: readonly CompiledContractRouteFor<ContractType>[]
}

function freezeCompiledRoutes(routes: readonly CompiledContractRoute[]): readonly CompiledContractRoute[] {
  for (const route of routes) {
    for (const parameters of route.pathParameters) {
      Object.freeze(parameters.names)
      Object.freeze(parameters)
    }
    Object.freeze(route.key)
    Object.freeze(route.pathParameters)
    Object.freeze(route)
  }
  return Object.freeze(routes)
}

/** Compiles a contract into the canonical flat route manifest shared by runtimes and integrations. */
export function compileContract<const ContractType extends Contract>(
  contract: ContractType
): CompiledContract<ContractType> {
  const routes = compileContractRoutes(contract)
  const state = getContractState(contract)
  if (state.compiled !== undefined) return state.compiled as CompiledContract<ContractType>

  const compiled = Object.freeze({
    kind: 'compiled-contract' as const,
    contract,
    routes: freezeCompiledRoutes(routes),
  }) as unknown as CompiledContract<ContractType>
  state.compiled = compiled
  return compiled
}
