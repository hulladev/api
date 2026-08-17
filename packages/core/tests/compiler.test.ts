import { describe, expect, expectTypeOf, test } from 'vitest'
import { z } from 'zod'
import { compileContract, defineContract, response, route, router, type CompiledContractRouteFor } from '../src'
import { compileCanonicalContract } from '../src/route-plan'

const organizationParams = z.object({ organizationId: z.string() })
const userParams = z.object({ userId: z.string() })
const health = route.get('/health', { responses: { 200: response.text(z.literal('ok')) } })
const organizations = router('/organizations/:organizationId', {
  params: organizationParams,
  routes: {
    listUsers: route.get('/users', { responses: { 200: response.json(z.array(z.string())) } }),
    getUser: route.get('/users/:userId', {
      params: userParams,
      responses: { 200: response.json(z.object({ id: z.string() })) },
    }),
  },
})
const contract = defineContract({
  basePath: '/api',
  routes: { health, organizations },
})

describe('contract compiler', () => {
  test('produces a frozen flat manifest in declaration order', () => {
    const compiled = compileContract(contract)

    expect(compiled).toMatchObject({ kind: 'compiled-contract', contract })
    expect(compiled.routes.map(({ key }) => key)).toEqual([
      ['health'],
      ['organizations', 'listUsers'],
      ['organizations', 'getUser'],
    ])
    expect(compiled.routes.map(({ method, path }) => ({ method, path }))).toEqual([
      { method: 'GET', path: '/api/health' },
      { method: 'GET', path: '/api/organizations/:organizationId/users' },
      { method: 'GET', path: '/api/organizations/:organizationId/users/:userId' },
    ])
    expect(Object.isFrozen(compiled)).toBe(true)
    expect(Object.isFrozen(compiled.routes)).toBe(true)
    expect(compiled.routes.every(Object.isFrozen)).toBe(true)
    expect(
      compiled.routes.every(({ key, pathParameters }) => Object.isFrozen(key) && Object.isFrozen(pathParameters))
    ).toBe(true)
  })

  test('preserves route identity and accumulates path declarations from outermost to innermost', () => {
    const compiled = compileContract(contract)
    const listUsers = compiled.routes[1]!
    const getUser = compiled.routes[2]!

    expect(listUsers.route).toBe(contract.routes.organizations.listUsers)
    expect(listUsers.pathParameters).toEqual([
      { path: '/organizations/:organizationId', names: ['organizationId'], schema: organizationParams },
    ])
    expect(getUser.route).toBe(contract.routes.organizations.getUser)
    expect(getUser.pathParameters).toEqual([
      { path: '/organizations/:organizationId', names: ['organizationId'], schema: organizationParams },
      { path: '/users/:userId', names: ['userId'], schema: userParams },
    ])
    expect(getUser.pathParameters.every(Object.isFrozen)).toBe(true)
    expect(getUser.pathParameters.every(({ names }) => Object.isFrozen(names))).toBe(true)
  })

  test('preserves correlated route keys, paths, methods, and declarations in its public type', () => {
    type Entry = CompiledContractRouteFor<typeof contract>
    type Health = Extract<Entry, { readonly key: readonly ['health'] }>
    type GetUser = Extract<Entry, { readonly key: readonly ['organizations', 'getUser'] }>

    expectTypeOf<Health['method']>().toEqualTypeOf<'GET'>()
    expectTypeOf<Health['path']>().toEqualTypeOf<'/api/health'>()
    expectTypeOf<Health['route']>().toEqualTypeOf<(typeof contract.routes)['health']>()
    expectTypeOf<GetUser['method']>().toEqualTypeOf<'GET'>()
    expectTypeOf<GetUser['path']>().toEqualTypeOf<'/api/organizations/:organizationId/users/:userId'>()
    expectTypeOf<GetUser['route']>().toEqualTypeOf<(typeof contract.routes.organizations)['getUser']>()
  })

  test('caches compilation by immutable contract identity', () => {
    expect(compileContract(contract)).toBe(compileContract(contract))
    expect(compileContract(defineContract({ routes: { health } }))).not.toBe(compileContract(contract))
  })

  test('compiles one shared client/server execution plan per contract', () => {
    const sharedResponse = response.json(z.object({ id: z.string() }))
    const plannedContract = defineContract({
      errors: { 400: sharedResponse },
      routes: {
        create: route.post('/users/:id', {
          params: z.object({ id: z.string() }),
          query: z.object({ source: z.string() }),
          headers: z.object({ authorization: z.string() }),
          body: z.object({ name: z.string() }),
          responses: { 201: sharedResponse },
        }),
      },
    })

    const plan = compileCanonicalContract(plannedContract)
    const plannedRoute = plan.routes[0]!

    expect(compileCanonicalContract(plannedContract)).toBe(plan)
    expect(plannedRoute.compiled).toBe(compileContract(plannedContract).routes[0])
    expect(plannedRoute).toMatchObject({ hasInput: true, pattern: ['users', ':id'] })
    expect(plannedRoute.encodePath).toBeTypeOf('function')
    expect(plannedRoute.decodePath).toBeTypeOf('function')
    expect(plannedRoute.encodeQuery).toBeTypeOf('function')
    expect(plannedRoute.decodeQuery).toBeTypeOf('function')
    expect(plannedRoute.headers).toBeDefined()
    expect(plannedRoute.body).toBeDefined()
    expect(plannedRoute.responses[0]?.[1]).toBe(plan.errors[0]?.[1])
  })

  test('preserves prototype-like route keys safely', () => {
    const keyedContract = defineContract({
      routes: {
        ['__proto__']: route.get('/prototype', { responses: { 200: response.text() } }),
        constructor: router('/constructors', {
          routes: {
            toString: route.get('/string', { responses: { 200: response.text() } }),
          },
        }),
      },
    })

    expect(compileContract(keyedContract).routes.map(({ key }) => key)).toEqual([
      ['__proto__'],
      ['constructor', 'toString'],
    ])
  })

  test('rejects malformed runtime input', () => {
    expect(() => compileContract({} as never)).toThrowError('Compiled contract input must be a contract definition')
  })
})
