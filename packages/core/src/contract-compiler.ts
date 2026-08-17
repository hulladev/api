import type { CompiledContractRoute, CompiledPathParameters } from './compiler'
import type { Contract, ContractRoutes } from './contract'
import { getContractState } from './contract-state'
import { isRecord } from './object'
import { joinRoutePaths, pathParamNames } from './paths'
import type { Route } from './route'
import { isRouter, routerEntries } from './router'
import type { ObjectSchema } from './validation'

function compilePathParameters(path: string, schema: ObjectSchema | undefined): CompiledPathParameters | undefined {
  const names = pathParamNames(path)
  if (names.length === 0) return undefined
  if (schema === undefined) throw new TypeError(`Contract route path "${path}" is missing a parameter schema`)
  return { path, names, schema }
}

function appendCompiledRoute(
  target: CompiledContractRoute[],
  key: readonly string[],
  pathParts: readonly string[],
  pathParameters: readonly CompiledPathParameters[],
  route: Route
): void {
  const ownParameters = compilePathParameters(route.path, 'params' in route ? route.params : undefined)
  target.push({
    key: [...key],
    method: route.method,
    path: joinRoutePaths(...pathParts, route.path),
    pathParameters: ownParameters === undefined ? [...pathParameters] : [...pathParameters, ownParameters],
    route,
  })
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
    const nestedParameters = ownParameters === undefined ? pathParameters : [...pathParameters, ownParameters]

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

export function compileContractRoutes(contract: Contract): readonly CompiledContractRoute[] {
  if (!isRecord(contract) || contract.kind !== 'contract' || !isRecord(contract.routes)) {
    throw new TypeError('Compiled contract input must be a contract definition')
  }

  const state = getContractState(contract)
  if (state.routes !== undefined) return state.routes as readonly CompiledContractRoute[]

  const routes: CompiledContractRoute[] = []
  compileRoutes(routes, contract.routes, [contract.basePath])
  state.routes = routes
  return routes
}
