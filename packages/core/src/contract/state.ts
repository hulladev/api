import type { CompiledContractRoute } from '../compiler'
import type { Contract } from './types'

export type ContractState = {
  canonicalErrors?: object
  compiled?: object
  mounts?: ReadonlyMap<object, ContractMount>
  routes?: object
}

export type ContractMount = {
  readonly key: readonly string[]
  readonly routes: readonly CompiledContractRoute[]
}

const contractStates = new WeakMap<object, ContractState>()

export function getContractState(contract: object): ContractState {
  let state = contractStates.get(contract)
  if (state === undefined) {
    state = {}
    contractStates.set(contract, state)
  }
  return state
}

function findContractState(contract: object): ContractState | undefined {
  return contractStates.get(contract)
}

export function compileContractRoutes(contract: Contract): readonly CompiledContractRoute[] {
  if ((typeof contract !== 'object' && typeof contract !== 'function') || contract === null) {
    throw new TypeError('Compiled contract input must be a contract definition')
  }

  const routes = findContractState(contract)?.routes
  if (routes === undefined) throw new TypeError('Compiled contract input must be a contract definition')
  return routes as readonly CompiledContractRoute[]
}

export function isContractMount(mount: ContractMount): boolean {
  return mount.key.length === 0
}

export function isRouteMount(mount: ContractMount, node: unknown): boolean {
  return mount.routes.length === 1 && mount.routes[0]?.route === node
}

export function findContractMount(contract: object, node: unknown): ContractMount | null | undefined {
  if ((typeof node !== 'object' && typeof node !== 'function') || node === null) return null
  return getContractState(contract).mounts?.get(node)
}
