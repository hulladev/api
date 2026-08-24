import { describe, expect, test } from 'vitest'
import { compileContract, defineContract, response, route } from '../src'
import { compileContractRoutes } from '../src/contract-compiler'
import { getContractState } from '../src/contract-state'

describe('contract route compilation', () => {
  test('reuses route metadata emitted while defining the contract', () => {
    const contract = defineContract({
      routes: { health: route.get('/health', { responses: { 200: response.text() } }) },
    })
    const definedRoutes = getContractState(contract).routes

    expect(definedRoutes).toBeDefined()
    expect(compileContractRoutes(contract)).toBe(definedRoutes)
    expect(compileContract(contract).routes).toBe(definedRoutes)
  })
})
