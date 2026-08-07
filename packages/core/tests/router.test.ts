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

    expect(declaration).toEqual({
      kind: 'router',
      path: '/users',
      params: undefined,
      routes,
    })
    expect(declaration.routes).not.toBe(routes)
    expect(Object.isFrozen(declaration)).toBe(true)
    expect(Object.isFrozen(declaration.routes)).toBe(true)
    expectTypeOf(declaration.kind).toEqualTypeOf<'router'>()
    expectTypeOf(declaration.path).toEqualTypeOf<'/users'>()
    expectTypeOf(declaration.params).toEqualTypeOf<undefined>()
    expectTypeOf(declaration.routes).toEqualTypeOf<Readonly<typeof routes>>()
    expectTypeOf(declaration).toExtend<Router>()
  })

  test('accepts params for prefixed and prefixless dynamic paths', () => {
    const prefixedParams = z.object({ organizationId: z.string() })
    const prefixlessParams = z.object({ organizationId: z.string() })
    const prefixed = router('/organizations/:organizationId', { params: prefixedParams, routes })
    const prefixless = router('organizations/:organizationId', { params: prefixlessParams, routes })

    expect(prefixed.params).toBe(prefixedParams)
    expect(prefixless.params).toBe(prefixlessParams)
    expectTypeOf(prefixed.params).toEqualTypeOf<typeof prefixedParams>()
    expectTypeOf(prefixless.params).toEqualTypeOf<typeof prefixlessParams>()
  })

  test('accepts a schema containing every parameter in a composite path', () => {
    const params = z.object({
      organizationId: z.string(),
      memberId: z.string(),
    })
    const declaration = router('/organizations/:organizationId/members/:memberId', { params, routes })

    expectTypeOf(declaration.params).toEqualTypeOf<typeof params>()
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

    expect(Object.keys(declaration.routes)).toEqual(['read', 'update'])
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

    expect(Object.keys(declaration.routes)).toEqual(['current', 'byId'])
  })
})
