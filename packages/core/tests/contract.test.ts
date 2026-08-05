import { describe, expect, expectTypeOf, test } from 'vitest'
import { z } from 'zod'
import { defineContract, type Contract } from '../src/contract'
import { response } from '../src/response'
import { route } from '../src/route'
import { router } from '../src/router'

const textResponses = { 200: response.text(z.string()) }

const health = route.get('/health', { responses: textResponses })
const users = router('/users', {
  routes: {
    list: route.get('/', { responses: textResponses }),
  },
})

describe('contract declaration', () => {
  test('returns an immutable contract whose routes contain route and router definitions', () => {
    const routes = { health, users }
    const contract = defineContract({ basePath: '/api', routes })

    expect(contract).toEqual({
      kind: 'contract',
      basePath: '/api',
      routes,
    })
    expect(contract.routes).not.toBe(routes)
    expect(Object.isFrozen(contract)).toBe(true)
    expect(Object.isFrozen(contract.routes)).toBe(true)
    expectTypeOf(contract.kind).toEqualTypeOf<'contract'>()
    expectTypeOf(contract.basePath).toEqualTypeOf<'/api'>()
    expectTypeOf(contract.routes).toEqualTypeOf<Readonly<typeof routes>>()
    expectTypeOf(contract).toExtend<Contract>()
  })

  test('base-path rejects empty segments (//)', () => {
    expect(() => defineContract({ basePath: '//', routes: { health } })).toThrowError(
      'Contract base path "//" cannot contain empty segments (//)'
    )
  })

  test('supports route-only and router-only route trees', () => {
    const routeOnly = defineContract({ routes: { health } })
    const routerOnly = defineContract({ basePath: '/', routes: { users } })

    expect(routeOnly.basePath).toBe('')
    expect(routeOnly.routes).toEqual({ health })
    expect(routerOnly.routes).toEqual({ users })
    expectTypeOf(routeOnly.basePath).toEqualTypeOf<''>()
    expectTypeOf(routerOnly.basePath).toEqualTypeOf<'/'>()
  })

  test.each(['api', 'api/', '/api/'])('accepts base path %s and normalizes it when joining route paths', (basePath) => {
    const duplicateRoutes = {
      first: route.get('/health', { responses: textResponses }),
      second: route.get('health', { responses: textResponses }),
    }

    expect(() => defineContract({ basePath, routes: duplicateRoutes })).toThrowError(
      `Contract contains conflicting routes "routes.first" (GET /api/health) and "routes.second" (GET /api/health)`
    )
  })

  test('requires at least one endpoint', () => {
    expect(() => defineContract({ routes: {} })).toThrowError('Contract must declare at least one route')
    expect(() => defineContract({ routes: { empty: router('/empty', { routes: {} }) } })).toThrowError(
      'Contract must declare at least one route'
    )
    const invalidDeclaration = () => {
      // @ts-expect-error A contract requires a route or router map.
      defineContract({})
    }
    expectTypeOf(invalidDeclaration).toBeFunction()
  })

  test.each(['/api//v1', '/api/:version', '/api/../v1'])('rejects unsafe base path %s', (basePath) => {
    expect(() => defineContract({ basePath, routes: { health } })).toThrow(TypeError)
  })

  test('explains how query parameters and fragments should be represented', () => {
    expect(() => defineContract({ basePath: '/api?version=1', routes: { health } })).toThrowError(
      'Contract base path "/api?version=1" cannot contain a query string; declare query parameters with the route "query" option instead'
    )
    expect(() => defineContract({ basePath: '/api#docs', routes: { health } })).toThrowError(
      'Contract base path "/api#docs" cannot contain a hash fragment; fragments are client-side only and should not be included in contract paths'
    )
  })

  test('rejects malformed runtime members', () => {
    expect(() => defineContract({ routes: { health: {} } } as never)).toThrowError(
      'Contract route "health" must be a route or router definition'
    )
    expect(() => defineContract({ routes: [] } as never)).toThrowError('Contract routes must be an object')
  })

  test('rejects conflicting routes within one router at the contract boundary', () => {
    const duplicateRouter = router('/users', {
      routes: {
        first: route.get('/active', { responses: textResponses }),
        second: route.get('/active', { responses: textResponses }),
      },
    })

    expect(duplicateRouter.routes).toHaveProperty('second')
    expect(() => defineContract({ routes: { users: duplicateRouter } })).toThrowError(
      'Contract contains conflicting routes "routes.users.routes.first" (GET /users/active) and "routes.users.routes.second" (GET /users/active)'
    )
  })

  test('treats different parameter names as the same effective route shape', () => {
    const duplicateRouter = router('/users', {
      routes: {
        byId: route.get('/:id', {
          params: z.object({ id: z.string() }),
          responses: textResponses,
        }),
        byUserId: route.get('/:userId', {
          params: z.object({ userId: z.string() }),
          responses: textResponses,
        }),
      },
    })

    expect(() => defineContract({ basePath: '/api', routes: { users: duplicateRouter } })).toThrowError(
      'Contract contains conflicting routes "routes.users.routes.byId" (GET /api/users/:id) and "routes.users.routes.byUserId" (GET /api/users/:userId)'
    )
  })

  test('rejects conflicts across routers and top-level routes', () => {
    const first = router('/users', {
      routes: { active: route.get('/active', { responses: textResponses }) },
    })
    const second = router('/users/active', {
      routes: { list: route.get('/', { responses: textResponses }) },
    })

    expect(() => defineContract({ routes: { first, second } })).toThrowError(
      'Contract contains conflicting routes "routes.first.routes.active" (GET /users/active) and "routes.second.routes.list" (GET /users/active)'
    )
    expect(() =>
      defineContract({
        routes: {
          active: route.get('/users/active', { responses: textResponses }),
          users: first,
        },
      })
    ).toThrowError(
      'Contract contains conflicting routes "routes.active" (GET /users/active) and "routes.users.routes.active" (GET /users/active)'
    )
  })

  test('matches a top-level route against a router root route', () => {
    const users = router('users', {
      routes: { list: route.get('/', { responses: textResponses }) },
    })

    expect(() =>
      defineContract({
        routes: {
          listUsers: route.get('/users', { responses: textResponses }),
          users,
        },
      })
    ).toThrowError(
      'Contract contains conflicting routes "routes.listUsers" (GET /users) and "routes.users.routes.list" (GET /users)'
    )
  })

  test('allows top-level resource routes alongside a router when their endpoints differ', () => {
    expect(() =>
      defineContract({
        routes: {
          exportUsers: route.get('/users/export', { responses: textResponses }),
          users,
        },
      })
    ).not.toThrow()
  })

  test('allows different methods and static/dynamic routes on the same effective path', () => {
    const users = router('/users', {
      routes: {
        current: route.get('/me', { responses: textResponses }),
        byId: route.get('/:id', {
          params: z.object({ id: z.string() }),
          responses: textResponses,
        }),
        update: route.patch('/:id', {
          params: z.object({ id: z.string() }),
          responses: textResponses,
        }),
      },
    })

    expect(() => defineContract({ routes: { users } })).not.toThrow()
  })
})
