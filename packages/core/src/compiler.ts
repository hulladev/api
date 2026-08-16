import type { Contract, ContractRoute, ContractRoutes } from './contract'
import type { HttpMethod } from './http'
import { isRecord } from './object'
import { joinRoutePaths, pathParamNames, type JoinRoutePaths } from './paths'
import type { Route } from './route'
import { isRouter, routerEntries, type AnyRouter, type Router } from './router'
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

const compiledContracts = new WeakMap<object, object>()

function compilePathParameters(path: string, schema: ObjectSchema | undefined): CompiledPathParameters | undefined {
  const names = pathParamNames(path)
  if (names.length === 0) return undefined
  if (schema === undefined) throw new TypeError(`Contract route path "${path}" is missing a parameter schema`)

  return Object.freeze({
    path,
    names: Object.freeze(names),
    schema,
  })
}

function appendCompiledRoute(
  target: CompiledContractRoute[],
  key: readonly string[],
  pathParts: readonly string[],
  pathParameters: readonly CompiledPathParameters[],
  route: Route
): void {
  const ownParameters = compilePathParameters(route.path, 'params' in route ? route.params : undefined)

  target.push(
    Object.freeze({
      key: Object.freeze([...key]),
      method: route.method,
      path: joinRoutePaths(...pathParts, route.path),
      pathParameters: Object.freeze(
        ownParameters === undefined ? [...pathParameters] : [...pathParameters, ownParameters]
      ),
      route,
    })
  )
}

function compileRoutes(
  target: CompiledContractRoute[],
  routes: ContractRoutes,
  pathPrefix: readonly string[],
  keyPrefix: readonly string[] = [],
  pathParameters: readonly CompiledPathParameters[] = []
): void {
  for (const [key, definition] of Object.entries(routes)) {
    if (!isRouter(definition)) {
      appendCompiledRoute(target, [...keyPrefix, key], pathPrefix, pathParameters, definition)
      continue
    }

    const metadata = definition.$meta
    const ownParameters = compilePathParameters(metadata.path, 'params' in metadata ? metadata.params : undefined)
    const nestedParameters =
      ownParameters === undefined ? pathParameters : Object.freeze([...pathParameters, ownParameters])

    for (const [routeKey, route] of routerEntries(definition)) {
      appendCompiledRoute(
        target,
        [...keyPrefix, key, routeKey],
        [...pathPrefix, metadata.path],
        nestedParameters,
        route
      )
    }
  }
}

/** Compiles a contract into the canonical flat route manifest shared by runtimes and integrations. */
export function compileContract<const ContractType extends Contract>(
  contract: ContractType
): CompiledContract<ContractType> {
  if (!isRecord(contract) || contract.kind !== 'contract' || !isRecord(contract.routes)) {
    throw new TypeError('Compiled contract input must be a contract definition')
  }

  const cached = compiledContracts.get(contract)
  if (cached !== undefined) return cached as CompiledContract<ContractType>

  const routes: CompiledContractRoute[] = []
  compileRoutes(routes, contract.routes, [contract.basePath])

  const compiled = Object.freeze({
    kind: 'compiled-contract' as const,
    contract,
    routes: Object.freeze(routes) as readonly CompiledContractRouteFor<ContractType>[],
  })
  compiledContracts.set(contract, compiled)
  return compiled
}
