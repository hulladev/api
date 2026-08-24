import * as v from 'valibot'
import { describe, expect, expectTypeOf, test } from 'vitest'
import { z } from 'zod'
import { response } from '../src/response'
import { route, type Route, type RouteParams, type RouteQuery } from '../src/route'
import { codec, type SchemaInput, type SchemaOutbound, type SchemaOutput } from '../src/validation'

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
      responses,
    })
    expect(Object.keys(declaration)).toEqual(['kind', 'method', 'path', 'responses'])
    expect('params' in declaration).toBe(false)
    expect('query' in declaration).toBe(false)
    expect('headers' in declaration).toBe(false)
    expect('body' in declaration).toBe(false)
    expect(declaration.responses).not.toBe(responses)
    expect(Object.isFrozen(declaration)).toBe(true)
    expect(Object.isFrozen(declaration.responses)).toBe(true)
    expectTypeOf(declaration.kind).toEqualTypeOf<'route'>()
    expectTypeOf(declaration.method).toEqualTypeOf<'GET'>()
    expectTypeOf(declaration.path).toEqualTypeOf<'/'>()
    expectTypeOf<'params' extends keyof typeof declaration ? true : false>().toEqualTypeOf<false>()
    expectTypeOf<'query' extends keyof typeof declaration ? true : false>().toEqualTypeOf<false>()
    expectTypeOf<'headers' extends keyof typeof declaration ? true : false>().toEqualTypeOf<false>()
    expectTypeOf<'body' extends keyof typeof declaration ? true : false>().toEqualTypeOf<false>()
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

    expect(declaration.query).toBe(query)
    expectTypeOf(declaration.query).toEqualTypeOf<typeof query>()
    expectTypeOf(declaration.headers).toEqualTypeOf<typeof headers>()
    expectTypeOf(declaration.body.schema).toEqualTypeOf<typeof body>()
    expectTypeOf<'params' extends keyof typeof declaration ? true : false>().toEqualTypeOf<false>()
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
    expectTypeOf(declaration.body.schema).toEqualTypeOf<typeof body>()
  })

  // oxlint-disable-next-line vitest/expect-expect -- This test is enforced by TypeScript diagnostics.
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

  test('enforces textual wire schemas for params, query, and headers', () => {
    route.get('/:id', {
      responses,
      // @ts-expect-error Path parameters must accept text on the wire.
      params: z.object({ id: z.number() }),
    })

    route.get('/users', {
      responses,
      // @ts-expect-error Query fields must accept strings or repeated strings on the wire.
      query: z.object({ page: z.number() }),
    })

    route.get('/users', {
      responses,
      // @ts-expect-error Header fields must accept strings on the wire.
      headers: z.object({ enabled: z.boolean() }),
    })

    route.get('/:id', {
      responses,
      // @ts-expect-error Valibot path parameters must also accept text on the wire.
      params: v.object({ id: v.number() }),
    })

    route.get('/users', {
      responses,
      // @ts-expect-error Valibot query fields must also accept textual wire values.
      query: v.object({ page: v.number() }),
    })

    route.get('/users', {
      responses,
      // @ts-expect-error Valibot headers must also accept textual wire values.
      headers: v.object({ enabled: v.boolean() }),
    })

    const declaration = route.get('/:id', {
      responses,
      params: codec(z.object({ id: z.string() }), z.object({ id: z.number() }), {
        decode: ({ id }) => ({ id: Number(id) }),
        encode: ({ id }) => ({ id: String(id) }),
      }),
      query: codec(
        z.object({ page: z.string(), tags: z.array(z.string()) }),
        z.object({ page: z.number(), tags: z.array(z.string()) }),
        {
          decode: ({ page, tags }) => ({ page: Number(page), tags }),
          encode: ({ page, tags }) => ({ page: String(page), tags }),
        }
      ),
    })

    expectTypeOf<SchemaOutput<typeof declaration.params>>().toEqualTypeOf<{ id: number }>()
    expectTypeOf<SchemaOutput<typeof declaration.query>>().toEqualTypeOf<{
      page: number
      tags: string[]
    }>()
    expectTypeOf<SchemaOutbound<typeof declaration.params>>().toEqualTypeOf<{ id: number }>()
    expectTypeOf<SchemaOutbound<typeof declaration.query>>().toEqualTypeOf<{
      page: number
      tags: string[]
    }>()
  })

  test('accepts native array query schemas without transport metadata', () => {
    const schema = z.object({ search: z.string(), tags: z.array(z.string()) })
    const declaration = route.get('/users', {
      responses,
      query: schema,
    })

    expectTypeOf(declaration.query).toEqualTypeOf<typeof schema>()
  })

  // oxlint-disable-next-line vitest/expect-expect -- This test is enforced by TypeScript diagnostics.
  test('requires params for a dynamic path', () => {
    // @ts-expect-error A dynamic path requires a matching params declaration.
    route.get('/:id', { responses })
  })

  // oxlint-disable-next-line vitest/expect-expect -- This test is enforced by TypeScript diagnostics.
  test('rejects a request body for GET routes', () => {
    route.get('/users', {
      responses,
      // @ts-expect-error GET routes cannot declare a request body.
      body: z.object({ name: z.string() }),
    })
  })

  test.each(['/users//active', '/users?active=true', '/users#active', '/users/../active', '/users\\active'])(
    'rejects unsafe route path %s',
    (path) => {
      const define = route.get as unknown as (
        path: string,
        options: { readonly responses: typeof responses }
      ) => unknown
      expect(() => define(path, { responses })).toThrow(TypeError)
    }
  )

  test('rejects empty and duplicate parameter names at runtime', () => {
    const define = route.get as unknown as (path: string, options: { readonly responses: typeof responses }) => unknown

    expect(() => define('/users/:', { responses })).toThrowError('contains an empty parameter name')
    expect(() => define('/parents/:id/children/:id', { responses })).toThrowError(
      'declares parameter "id" more than once'
    )
  })
})
