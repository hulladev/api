import { describe, expect, expectTypeOf, test } from 'vitest'
import { z } from 'zod'
import { response } from '../src/response'
import { route } from '../src/route'
import { router, type Router } from '../src/router'

const routes = {
  list: route.get('/', { responses: { 200: response.text(z.string()) } }),
}

describe('router declaration', () => {
  test('returns a normalized immutable router for a static path', () => {
    const declaration = router('/users', { routes })

    expect(declaration).toEqual(routes)
    expect(Object.keys(declaration)).toEqual(['list'])
    expect(declaration.$meta).toEqual({ kind: 'router', path: '/users' })
    expect('params' in declaration.$meta).toBe(false)
    expect(declaration).not.toBe(routes)
    expect(declaration.list).toBe(routes.list)
    expect(Object.isFrozen(declaration)).toBe(true)
    expect(Object.isFrozen(declaration.$meta)).toBe(true)
    expectTypeOf(declaration.$meta.kind).toEqualTypeOf<'router'>()
    expectTypeOf(declaration.$meta.path).toEqualTypeOf<'/users'>()
    expectTypeOf<'params' extends keyof (typeof declaration)['$meta'] ? true : false>().toEqualTypeOf<false>()
    expectTypeOf(declaration.list).toExtend<(typeof routes)['list']>()
    expectTypeOf(declaration).toExtend<Router>()
  })

  test('accepts params for prefixed and prefixless dynamic paths', () => {
    const prefixedParams = z.object({ organizationId: z.string() })
    const prefixlessParams = z.object({ organizationId: z.string() })
    const prefixed = router('/organizations/:organizationId', { params: prefixedParams, routes })
    const prefixless = router('organizations/:organizationId', { params: prefixlessParams, routes })

    expect(prefixed.$meta.params).toBe(prefixedParams)
    expect(prefixless.$meta.params).toBe(prefixlessParams)
    expectTypeOf(prefixed.$meta.params).toEqualTypeOf<typeof prefixedParams>()
    expectTypeOf(prefixless.$meta.params).toEqualTypeOf<typeof prefixlessParams>()
  })

  test('accepts a schema containing every parameter in a composite path', () => {
    const params = z.object({
      organizationId: z.string(),
      memberId: z.string(),
    })
    const declaration = router('/organizations/:organizationId/members/:memberId', { params, routes })

    expectTypeOf(declaration.$meta.params).toEqualTypeOf<typeof params>()
  })

  test('requires params for a dynamic path', () => {
    // @ts-expect-error A dynamic path requires a params declaration.
    router('/organizations/:organizationId', { routes })
  })

  test('requires a schema for every parameter in a dynamic path', () => {
    router('/organizations/:organizationId/members/:memberId', {
      // @ts-expect-error The params schema must contain every path parameter.
      params: z.object({ organizationId: z.string() }),
      routes,
    })
  })

  test('rejects params for a static path', () => {
    router('/organizations', {
      // @ts-expect-error A static path cannot declare params.
      params: z.object({ organizationId: z.string() }),
      routes,
    })
  })

  test('rejects a raw schema record for params', () => {
    router('/organizations/:organizationId', {
      // @ts-expect-error Params must be declared as an object Standard Schema.
      params: { organizationId: z.string() },
      routes,
    })
  })

  test('allows different methods for the same path', () => {
    const textResponses = { 200: response.text(z.string()) }
    const declaration = router('/users', {
      routes: {
        read: route.get('/:id', {
          params: z.object({ id: z.string() }),
          responses: textResponses,
        }),
        update: route.patch('/:id', {
          params: z.object({ id: z.string() }),
          responses: textResponses,
        }),
      },
    })

    expect(Object.keys(declaration)).toEqual(['read', 'update'])
  })

  test('allows static and dynamic paths to coexist', () => {
    const textResponses = { 200: response.text(z.string()) }
    const declaration = router('/users', {
      routes: {
        current: route.get('/me', { responses: textResponses }),
        byId: route.get('/:id', {
          params: z.object({ id: z.string() }),
          responses: textResponses,
        }),
      },
    })

    expect(Object.keys(declaration)).toEqual(['current', 'byId'])
  })

  test('nests routers without copying their declarations', () => {
    const members = router('/members', { routes })
    const organizations = router('/organizations', { routes: { members } })

    expect(organizations.members).toBe(members)
    expect(organizations.members.list).toBe(routes.list)
    expect(Object.keys(organizations)).toEqual(['members'])
  })

  test('rejects parameters redeclared by a child route', () => {
    const child = route.get('/children/:id', {
      params: z.object({ id: z.string() }),
      responses: { 200: response.text(z.string()) },
    })

    expect(() =>
      router('/parents/:id', {
        params: z.object({ id: z.string() }),
        routes: { child },
      })
    ).toThrowError('Router member "child" redeclares parameter "id"')
  })

  test.each(['/users//active', '/users?active=true', '/users#active', '/users/../active', '/users\\active'])(
    'rejects unsafe router path %s',
    (path) => {
      const define = router as unknown as (path: string, options: { readonly routes: typeof routes }) => unknown
      expect(() => define(path, { routes })).toThrow(TypeError)
    }
  )
})
