import type { Contract, ContractRoute } from './contract'
import type { JoinRoutePaths } from './contract/paths'
import type { HttpMethod, Route } from './contract/route'
import type { AnyRouter, RouterChildrenFor } from './contract/router'
import { compileContractRoutes, getContractState } from './contract/state'
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

type CompiledDefinition<
  PathPrefix extends string,
  KeyPrefix extends readonly string[],
  Key extends string,
  Definition extends ContractRoute,
> =
  Definition extends Route<infer _Method, infer RoutePath>
    ? CompiledContractRoute<Definition, readonly [...KeyPrefix, Key], JoinRoutePaths<readonly [PathPrefix, RoutePath]>>
    : Definition extends AnyRouter
      ? CompiledRouteTree<
          JoinRoutePaths<readonly [PathPrefix, Definition['$meta']['path']]>,
          RouterChildrenFor<Definition>,
          readonly [...KeyPrefix, Key]
        >
      : never

type CompiledRouteTree<
  PathPrefix extends string,
  Routes extends Readonly<Record<string, ContractRoute>>,
  KeyPrefix extends readonly string[] = readonly [],
> = {
  readonly [Key in StringKey<Routes>]: CompiledDefinition<PathPrefix, KeyPrefix, Key, Routes[Key]>
}[StringKey<Routes>]

export type CompiledContractRouteFor<ContractType extends Contract = Contract> = CompiledRouteTree<
  ContractType['basePath'],
  ContractType['routes']
>

export type CompiledContract<ContractType extends Contract = Contract> = {
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
    contract,
    routes: freezeCompiledRoutes(routes),
  }) as unknown as CompiledContract<ContractType>
  state.compiled = compiled
  return compiled
}
