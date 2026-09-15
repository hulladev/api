import { describe, expect, expectTypeOf, test } from 'vitest'
import { z } from 'zod'
import {
  compileContract,
  contractInput,
  defineContract,
  response,
  route,
  router,
  type CompiledContractRouteFor,
} from '../src'

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
const contract = defineContract({ basePath: '/api', routes: { health, organizations } })

describe('contract compiler', () => {
  test('produces a frozen flat manifest in declaration order', () => {
    const compiled = compileContract(contract)

    expect(compiled).toMatchObject({ contract })
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

    expect(listUsers.route).toEqual(contract.routes.organizations.listUsers)
    expect(listUsers.pathParameters).toEqual([
      { path: '/organizations/:organizationId', names: ['organizationId'], schema: organizationParams },
    ])
    expect(getUser.route).toEqual(contract.routes.organizations.getUser)
    expect(getUser.pathParameters).toEqual([
      { path: '/organizations/:organizationId', names: ['organizationId'], schema: organizationParams },
      { path: '/users/:userId', names: ['userId'], schema: userParams },
    ])
    expect(getUser.pathParameters.every(Object.isFrozen)).toBe(true)
    expect(getUser.pathParameters.every(({ names }) => Object.isFrozen(names))).toBe(true)
  })

  test('preserves correlated route keys, paths, methods, and declarations in its public type', () => {
    type Entry = CompiledContractRouteFor<typeof contract>
    expectTypeOf<Extract<'$contract', keyof Entry['route']>>().toEqualTypeOf<never>()
    type Health = Extract<Entry, { readonly key: readonly ['health'] }>
    type GetUser = Extract<Entry, { readonly key: readonly ['organizations', 'getUser'] }>

    expectTypeOf<Health['method']>().toEqualTypeOf<'GET'>()
    expectTypeOf<Health['path']>().toEqualTypeOf<'/api/health'>()
    expectTypeOf<Health['route']>().toEqualTypeOf<Omit<(typeof contract.routes)['health'], '$contract'>>()
    expectTypeOf<GetUser['method']>().toEqualTypeOf<'GET'>()
    expectTypeOf<GetUser['path']>().toEqualTypeOf<'/api/organizations/:organizationId/users/:userId'>()
    expectTypeOf<GetUser['route']>().toEqualTypeOf<
      Omit<(typeof contract.routes.organizations)['getUser'], '$contract'>
    >()
  })

  test('flattens recursive routers and accumulates every ancestor parameter', async () => {
    const organization = z.object({ organizationId: z.string() })
    const member = z.object({ memberId: z.string() })
    const permission = z.object({ permissionId: z.string() })
    const nested = defineContract({
      basePath: '/api',
      routes: {
        organizations: router('/organizations/:organizationId', {
          params: organization,
          routes: {
            members: router('/members/:memberId', {
              params: member,
              routes: {
                permissions: router('/permissions', {
                  routes: {
                    byId: route.get('/:permissionId', {
                      params: permission,
                      responses: { 200: response.text() },
                    }),
                  },
                }),
              },
            }),
          },
        }),
      },
    })

    const [compiled] = compileContract(nested).routes
    expect(compiled?.key).toEqual(['organizations', 'members', 'permissions', 'byId'])
    expect(compiled?.path).toBe('/api/organizations/:organizationId/members/:memberId/permissions/:permissionId')
    expect(compiled?.pathParameters.map(({ schema }) => schema)).toEqual([organization, member, permission])

    const schema = contractInput(nested, nested.routes.organizations.members.permissions.byId)
    const result = await schema['~standard'].validate({
      params: { organizationId: 'org-1', memberId: 'member-1', permissionId: 'read' },
    })
    expect(result).toEqual({
      value: { params: { organizationId: 'org-1', memberId: 'member-1', permissionId: 'read' } },
    })
    expectTypeOf<
      Extract<CompiledContractRouteFor<typeof nested>, { readonly method: 'GET' }>['path']
    >().toEqualTypeOf<'/api/organizations/:organizationId/members/:memberId/permissions/:permissionId'>()
  })

  test('compiles flat resource routes and nested router roots to the same endpoint', () => {
    const params = z.object({ organizationId: z.string() })
    const responses = { 200: response.json(z.array(z.string())) }
    const flat = defineContract({
      basePath: '/api',
      routes: {
        organizations: router('/organizations/:organizationId', {
          params,
          routes: {
            listUsers: route.get('/users', { responses }),
          },
        }),
      },
    })
    const nested = defineContract({
      basePath: '/api',
      routes: {
        organizations: router('/organizations/:organizationId', {
          params,
          routes: {
            users: router('/users', {
              routes: {
                list: route.get('/', { responses }),
              },
            }),
          },
        }),
      },
    })

    const [flatRoute] = compileContract(flat).routes
    const [nestedRoute] = compileContract(nested).routes

    expect(flatRoute).toMatchObject({
      key: ['organizations', 'listUsers'],
      method: 'GET',
      path: '/api/organizations/:organizationId/users',
    })
    expect(nestedRoute).toMatchObject({
      key: ['organizations', 'users', 'list'],
      method: 'GET',
      path: '/api/organizations/:organizationId/users',
    })
    expect(nestedRoute?.pathParameters).toEqual(flatRoute?.pathParameters)

    const input = { params: { organizationId: 'org-1' } }
    const flatInput = contractInput(flat, flat.routes.organizations.listUsers)
    const nestedInput = contractInput(nested, nested.routes.organizations.users.list)

    expect(flatInput['~standard'].validate(input)).toEqual({ value: input })
    expect(nestedInput['~standard'].validate(input)).toEqual({ value: input })
  })

  test('reuses the public immutable manifest', () => {
    expect(compileContract(contract).routes).toBe(contract.$contract.routes)
    expect(compileContract(defineContract({ routes: { health } }))).not.toBe(compileContract(contract))
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
    expect(() => compileContract({} as never)).toThrowError('Expected a contract or selected contract node')
  })
})
