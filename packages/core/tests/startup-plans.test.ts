import { expect, test } from 'vitest'
import { z } from 'zod'
import { defineContract, response, route, router } from '../src'
import { defineClient } from '../src/client'
import { compileContractRoutes } from '../src/contract/state'

test('keeps inherited parameter scopes isolated between sibling routers', () => {
  const params = z.object({ id: z.string() })
  const contract = defineContract({
    routes: {
      left: router('/left/:id', { params, routes: { get: route.get('/', { responses: { 204: response.empty() } }) } }),
      right: router('/right', { routes: { get: route.get('/:id', { params, responses: { 204: response.empty() } }) } }),
    },
  })
  expect(compileContractRoutes(contract).map(({ pathParameters }) => pathParameters.map(({ names }) => names))).toEqual(
    [[['id']], [['id']]]
  )
  expect(() =>
    defineContract({
      routes: {
        duplicate: router('/parent/:id', {
          params,
          routes: { get: route.get('/:id', { params, responses: { 204: response.empty() } }) },
        }),
      },
    })
  ).toThrow(/redeclares parameter/)
})

test('retains own non-enumerable client controls and lazy stable route selection', () => {
  const contract = defineContract({ routes: { get: route.get('/', { responses: { 204: response.empty() } }) } })
  const client = defineClient(contract, { transport: () => ({ status: 204, headers: {}, readBody: () => undefined }) })
  for (const name of ['contract', 'context', 'middlewares', 'middleware', 'use', 'select', 'compose']) {
    expect(Object.getOwnPropertyDescriptor(client, name)).toMatchObject({
      enumerable: false,
      configurable: false,
      writable: false,
    })
  }
  expect(Object.keys(client)).toEqual(['get'])
  expect(typeof Object.getOwnPropertyDescriptor(client, 'get')!.get).toBe('function')
  const selected = client.get
  expect(client.get).toBe(selected)
  expect(client.select(contract.routes.get)).toBe(selected)
})
