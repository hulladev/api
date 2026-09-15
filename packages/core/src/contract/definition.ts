import type { ErrorStatusMap, NormalizedErrorStatusMap } from '../declared-errors'
import { createContract } from './creation'
import { routeInput, type RouteInputSchema } from './input'
import type { Route } from './route'
import { findContractMount, isRouteMount } from './state'
import type { Contract, ContractNodeFor, ContractNodeKey, ContractOptions, ContractRoutes } from './types'

/** Returns the canonical mounted key for a route, router, or contract node. */
export function contractNodeKey<const ContractType extends Contract, const Node extends ContractNodeFor<ContractType>>(
  contract: ContractType,
  node: Node
): ContractNodeKey<Node> {
  const mount = findContractMount(contract, node)
  if (mount === null || mount === undefined) throw new TypeError('Contract node must belong to its contract')
  return mount.key as ContractNodeKey<Node>
}

/** Creates the complete input schema for a route mounted in a contract. */
export function contractInput<const ContractType extends Contract, const RouteType extends Route>(
  contract: ContractType,
  route: RouteType
): RouteInputSchema<RouteType> {
  const mount = findContractMount(contract, route)
  if (mount === null || mount === undefined || !isRouteMount(mount, route)) {
    throw new TypeError('Route input schema route must belong to its contract')
  }
  return routeInput(
    route,
    mount.routes[0]!.pathParameters.map(({ schema }) => schema)
  )
}
export function defineContract<
  const Routes extends ContractRoutes,
  const BasePath extends string = '',
  const Errors extends ErrorStatusMap = {},
>(options: ContractOptions<BasePath, Routes, Errors>): Contract<BasePath, Routes, NormalizedErrorStatusMap<Errors>>

export function defineContract(options: ContractOptions): Contract {
  return createContract(options)
}
