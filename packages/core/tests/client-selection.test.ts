import { expect, test } from 'vitest'
import { z } from 'zod'
import { defineContract, response, route, router } from '../src'
import { createClient } from '../src/client'
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

test('exposes only stable endpoint functions on the client', () => {
  const contract = defineContract({ routes: { use: route.get('/', { responses: { 204: response.empty() } }) } })
  const client = createClient(contract, { transport: () => ({ status: 204, headers: {}, readBody: () => undefined }) })
  expect(Object.keys(client)).toEqual(['use'])
  expect(client.use).toBe(client.use)
  expect(Object.isFrozen(client)).toBe(true)
  expect('select' in client).toBe(false)
})

test('allows a compose endpoint and independent partial client namespaces', async () => {
  const contract = defineContract({
    routes: {
      compose: route.get('/compose', { responses: { 200: response.text() } }),
      unused: route.get('/unused', { responses: { 204: response.empty() } }),
    },
  })
  const calls: string[] = []
  const options = {
    transport: (request: { path: string }) => {
      calls.push(request.path)
      return { status: 200, headers: { 'content-type': 'text/plain' }, readBody: () => 'ok' }
    },
  }
  const base = createClient(contract, options)
  const middlewareCalls: string[] = []
  const scoped = createClient(contract.routes.compose, {
    ...options,
    middleware: [
      ({ next }) => {
        middlewareCalls.push('scoped')
        return next()
      },
    ],
  })
  const partial = { command: scoped }
  await expect(partial.command()).resolves.toMatchObject({ status: 200, body: 'ok' })
  await expect(base.compose()).resolves.toMatchObject({ status: 200, body: 'ok' })
  expect(calls).toEqual(['/compose', '/compose'])
  expect(middlewareCalls).toEqual(['scoped'])
})
