import * as v from 'valibot'
import { describe, expect, expectTypeOf, test } from 'vitest'
import { z } from 'zod'
import { response } from '../src/response'
import { route, type AnyRoute, type RouteParams, type RouteQuery } from '../src/route'
import type { SchemaInput, SchemaOutput } from '../src/validation'

const responses = {
  200: response.json(
    z.object({
      message: z.string(),
    })
  ),
}

route.get('/', { responses: { 200: response.text(z.string()) } })

describe('RouteParams', () => {
  test('extracts params from slash-prefixed paths', () => {
    expectTypeOf<SchemaInput<RouteParams<'/:id'>>>().toEqualTypeOf<{ readonly id: unknown }>()
    expectTypeOf<SchemaInput<RouteParams<'/users/:userId'>>>().toEqualTypeOf<{
      readonly userId: unknown
    }>()
  })

  test('extracts params from paths without a slash prefix', () => {
    expectTypeOf<SchemaInput<RouteParams<':id'>>>().toEqualTypeOf<{ readonly id: unknown }>()
    expectTypeOf<SchemaInput<RouteParams<'users/:userId'>>>().toEqualTypeOf<{
      readonly userId: unknown
    }>()
  })

  test('extracts multiple params', () => {
    expectTypeOf<SchemaInput<RouteParams<'/users/:userId/posts/:postId'>>>().toEqualTypeOf<{
      readonly userId: unknown
      readonly postId: unknown
    }>()
  })

  test('produces an empty type when the path has no params', () => {
    expectTypeOf<SchemaInput<RouteParams<'/'>>>().toEqualTypeOf<{}>()
    expectTypeOf<SchemaOutput<RouteParams<'users'>>>().toExtend<Readonly<Record<string, unknown>>>()
  })
})

describe('RouteQuery', () => {
  test('is a Standard Schema with object input and output', () => {
    expectTypeOf(z.object({ search: z.string().optional() })).toExtend<RouteQuery>()
    expectTypeOf(z.strictObject({ search: z.string().optional() })).toExtend<RouteQuery>()
  })
})

describe('route declaration', () => {
  test('returns a normalized immutable route for a static path', () => {
    const declaration = route.get('/', { responses })

    expect(declaration).toEqual({
      kind: 'route',
      method: 'GET',
      path: '/',
      params: undefined,
      query: undefined,
      headers: undefined,
      body: undefined,
      responses,
    })
    expect(declaration.responses).not.toBe(responses)
    expect(Object.isFrozen(declaration)).toBe(true)
    expect(Object.isFrozen(declaration.responses)).toBe(true)
    expectTypeOf(declaration.kind).toEqualTypeOf<'route'>()
    expectTypeOf(declaration.method).toEqualTypeOf<'GET'>()
    expectTypeOf(declaration.path).toEqualTypeOf<'/'>()
    expectTypeOf(declaration.params).toEqualTypeOf<undefined>()
    expectTypeOf(declaration.responses).toEqualTypeOf<Readonly<typeof responses>>()
    expectTypeOf(declaration).toExtend<AnyRoute>()
  })

  test('accepts params for prefixed and prefixless dynamic paths', () => {
    const prefixedParams = z.object({ id: z.string() })
    const prefixlessParams = z.object({ id: z.string() })
    const prefixed = route.get('/:id', { responses, params: prefixedParams })
    const prefixless = route.get(':id', { responses, params: prefixlessParams })

    expectTypeOf(prefixed.params).toEqualTypeOf<typeof prefixedParams>()
    expectTypeOf(prefixless.params).toEqualTypeOf<typeof prefixlessParams>()
  })

  test('preserves exact request schema types', () => {
    const query = z.object({ search: z.string().optional() })
    const headers = z.object({ authorization: z.string() })
    const body = z.object({ name: z.string() })
    const declaration = route.post('/users', { responses, query, headers, body })

    expectTypeOf(declaration.query).toEqualTypeOf<typeof query>()
    expectTypeOf(declaration.headers).toEqualTypeOf<typeof headers>()
    expectTypeOf(declaration.body).toEqualTypeOf<typeof body>()
    expectTypeOf(declaration.params).toEqualTypeOf<undefined>()
  })

  test('accepts Valibot schemas throughout a route contract', () => {
    const params = v.object({ id: v.string() })
    const query = v.object({ search: v.optional(v.string()) })
    const headers = v.object({ authorization: v.string() })
    const body = v.object({ name: v.string() })
    const declaration = route.post('/:id', {
      params,
      query,
      headers,
      body,
      responses: { 200: response.json(v.object({ id: v.string() })) },
    })

    expectTypeOf(declaration.params).toEqualTypeOf<typeof params>()
    expectTypeOf(declaration.query).toEqualTypeOf<typeof query>()
    expectTypeOf(declaration.headers).toEqualTypeOf<typeof headers>()
    expectTypeOf(declaration.body).toEqualTypeOf<typeof body>()
  })

  test('rejects raw schema records for params and query', () => {
    route.get('/:id', {
      responses,
      // @ts-expect-error Params must be declared as an object Standard Schema.
      params: { id: z.string() },
    })

    route.get('/users', {
      responses,
      // @ts-expect-error Query parameters must be declared as an object Standard Schema.
      query: { search: z.string() },
    })

    route.get('/users', {
      responses,
      // @ts-expect-error Headers must be declared as an object Standard Schema.
      headers: z.string(),
    })
  })

  test('requires params for a dynamic path', () => {
    // @ts-expect-error A dynamic path requires a matching params declaration.
    route.get('/:id', { responses })
  })

  test('rejects a request body for GET routes', () => {
    route.get('/users', {
      responses,
      // @ts-expect-error GET routes cannot declare a request body.
      body: z.object({ name: z.string() }),
    })
  })
})
