import * as v from 'valibot'
import { describe, expect, expectTypeOf, test } from 'vitest'
import { z } from 'zod'
import { request } from '../src/request'
import { response } from '../src/response'
import { route, type Route, type RouteParams, type RouteQuery } from '../src/route'
import type { SchemaInput, SchemaOutput } from '../src/validation'
import { text } from '../src/zod'

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
    expectTypeOf<SchemaInput<RouteParams<'/:id'>>>().toEqualTypeOf<{ readonly id: string }>()
    expectTypeOf<SchemaInput<RouteParams<'/users/:userId'>>>().toEqualTypeOf<{
      readonly userId: string
    }>()
  })

  test('extracts params from paths without a slash prefix', () => {
    expectTypeOf<SchemaInput<RouteParams<':id'>>>().toEqualTypeOf<{ readonly id: string }>()
    expectTypeOf<SchemaInput<RouteParams<'users/:userId'>>>().toEqualTypeOf<{
      readonly userId: string
    }>()
  })

  test('extracts multiple params', () => {
    expectTypeOf<SchemaInput<RouteParams<'/users/:userId/posts/:postId'>>>().toEqualTypeOf<{
      readonly userId: string
      readonly postId: string
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
    expectTypeOf(declaration).toExtend<Route>()
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

    expectTypeOf(declaration.query.schema).toEqualTypeOf<typeof query>()
    expectTypeOf(declaration.headers).toEqualTypeOf<typeof headers>()
    expectTypeOf(declaration.body.schema).toEqualTypeOf<typeof body>()
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
    expectTypeOf(declaration.query.schema).toEqualTypeOf<typeof query>()
    expectTypeOf(declaration.headers).toEqualTypeOf<typeof headers>()
    expectTypeOf(declaration.body.schema).toEqualTypeOf<typeof body>()
  })

  test('rejects raw schema records for params and query', () => {
    void (() => {
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
  })

  test('enforces text-first params, query, and headers', () => {
    route.get('/:id', {
      responses,
      // @ts-expect-error Path parameters must accept text on the wire.
      params: z.object({ id: z.number() }),
    })

    route.get('/users', {
      responses,
      // @ts-expect-error Query fields must accept text or repeated text on the wire.
      query: z.object({ page: z.number() }),
    })

    route.get('/users', {
      responses,
      // @ts-expect-error Headers must accept text on the wire.
      headers: z.object({ enabled: z.boolean() }),
    })

    const declaration = route.get('/:id', {
      responses,
      params: z.object({ id: text.integer() }),
      query: z.object({ page: text.integer(), tags: z.array(z.string()) }),
    })

    expectTypeOf<SchemaOutput<typeof declaration.params>>().toEqualTypeOf<{ id: number }>()
    expectTypeOf<SchemaOutput<typeof declaration.query.schema>>().toEqualTypeOf<{
      page: number
      tags: string[]
    }>()
  })

  test('requires explicit repeated metadata for non-Zod query schemas', () => {
    const schema = v.object({ search: v.string(), tags: v.array(v.string()) })

    void (() => {
      route.get('/users', {
        responses,
        // @ts-expect-error Opaque Standard Schemas must declare repeated query keys.
        query: schema,
      })

      // @ts-expect-error Every repeated input key must be listed.
      request.query(schema, { repeated: [] })

      // @ts-expect-error Singular input keys cannot be marked as repeated.
      request.query(schema, { repeated: ['search'] })

      // @ts-expect-error Unknown input keys cannot be marked as repeated.
      request.query(schema, { repeated: ['missing'] })

      const ambiguous = v.object({ value: v.union([v.string(), v.array(v.string())]) })
      // @ts-expect-error Opaque query fields cannot mix singular and repeated wire inputs.
      request.query(ambiguous, { repeated: [] })
    })

    const declaration = route.get('/users', {
      responses,
      query: request.query(schema, { repeated: ['tags'] }),
    })

    expect(declaration.query.repeated).toEqual(['tags'])
    expectTypeOf(declaration.query.schema).toEqualTypeOf<typeof schema>()
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
