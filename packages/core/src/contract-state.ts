import type { CompiledContractRoute } from './compiler'

export type ContractState = {
  canonical?: object
  canonicalErrors?: object
  compiled?: object
  mounts?: ReadonlyMap<object, ContractMount>
  routes?: object
}

export type ContractMount = {
  readonly key: readonly string[]
  readonly kind: 'contract' | 'route' | 'router'
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

export function findContractMount(contract: object, node: unknown): ContractMount | null | undefined {
  if ((typeof node !== 'object' && typeof node !== 'function') || node === null) return null
  return getContractState(contract).mounts?.get(node)
}
