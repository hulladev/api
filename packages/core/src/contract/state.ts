import type { CompiledContractRoute } from '../compiler'
import { isRecord } from '../object'
import type { Contract, ContractSelection } from './types'

export type ContractMount = Pick<ContractSelection, 'key' | 'routes'>

/** Reads the public manifest; no registration or process-local identity is required. */
export function contractSelection(node: unknown): ContractSelection {
  if (!isRecord(node) || !isRecord(node['$contract']))
    throw new TypeError('Expected a contract or selected contract node')
  const selection = node['$contract']
  if (!Array.isArray(selection['key']) || !Array.isArray(selection['routes']) || !isRecord(selection['errors'])) {
    throw new TypeError('Invalid contract selection metadata')
  }
  return selection as ContractSelection
}

export function compileContractRoutes(contract: Contract): readonly CompiledContractRoute[] {
  return contractSelection(contract).routes
}

export function isContractMount(mount: ContractMount): boolean {
  return mount.key.length === 0
}

export function isRouteMount(mount: ContractMount, node: unknown): boolean {
  return mount.routes.length === 1 && isRecord(node) && node['kind'] === 'route'
}

export function findContractMount(contract: object, node: unknown): ContractMount | null | undefined {
  if (!isRecord(node)) return null
  if (!('$contract' in node)) return undefined
  const selection = contractSelection(node)
  const routes = contractSelection(contract).routes.filter((entry) =>
    selection.key.every((part, index) => entry.key[index] === part)
  )
  if (
    routes.length !== selection.routes.length ||
    routes.some((entry, index) => {
      const candidate = selection.routes[index]!
      return (
        entry.method !== candidate.method ||
        entry.path !== candidate.path ||
        entry.route !== candidate.route ||
        entry.key.some((part, index) => candidate.key[index] !== part)
      )
    })
  )
    return undefined
  return { key: selection.key, routes }
}
