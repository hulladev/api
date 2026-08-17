import type { CompiledContractRoute } from './compiler'
import { compileContractRouteDefinitions, type Contract } from './contract'
import { getContractState } from './contract-state'
import { isRecord } from './object'

export function compileContractRoutes(contract: Contract): readonly CompiledContractRoute[] {
  if (!isRecord(contract) || contract.kind !== 'contract' || !isRecord(contract.routes)) {
    throw new TypeError('Compiled contract input must be a contract definition')
  }

  const state = getContractState(contract)
  if (state.routes !== undefined) return state.routes as readonly CompiledContractRoute[]

  const routes = compileContractRouteDefinitions(contract.basePath, contract.routes, contract.errors)
  state.routes = routes
  return routes
}
