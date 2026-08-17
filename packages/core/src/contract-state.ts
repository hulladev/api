export type ContractState = {
  canonical?: object
  compiled?: object
  routes?: object
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
