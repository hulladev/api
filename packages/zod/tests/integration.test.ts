import { response, route, router } from '@hulla/api'
import type { ClientRouteInput } from '@hulla/api/client'
import * as v from 'valibot'
import { describe, expect, expectTypeOf, test } from 'vitest'
import { z } from 'zod'
import { codec as zodCodec, query as zodQuery, routeInput, routeOutput, text } from '../src'

describe('Zod text codecs', () => {
  test('converts strict safe integers in both directions', () => {
    const schema = text.integer()

    expect(z.decode(schema, '42')).toBe(42)
    expect(z.encode(schema, 42)).toBe('42')
    expect(z.encode(schema, -0)).toBe('-0')
    expect(z.safeDecode(schema, '01').success).toBe(false)
    expect(z.safeDecode(schema, '1.2').success).toBe(false)
    expect(z.safeDecode(schema, String(Number.MAX_SAFE_INTEGER + 1)).success).toBe(false)
    expect(z.safeEncode(schema, Number.MAX_SAFE_INTEGER + 1).success).toBe(false)
    expectTypeOf<z.input<typeof schema>>().toEqualTypeOf<string>()
    expectTypeOf<z.output<typeof schema>>().toEqualTypeOf<number>()
  })

  test('converts finite JSON numbers and preserves negative zero', () => {
    const schema = text.number()

    expect(z.decode(schema, '-1.25e2')).toBe(-125)
    expect(Object.is(z.decode(schema, '-0'), -0)).toBe(true)
    expect(z.encode(schema, -0)).toBe('-0')
    expect(z.safeDecode(schema, '0x10').success).toBe(false)
    expect(z.safeDecode(schema, 'Infinity').success).toBe(false)
    expect(z.safeDecode(schema, '1_000').success).toBe(false)
    expect(z.safeEncode(schema, Number.POSITIVE_INFINITY).success).toBe(false)
  })

  test('converts arbitrary decimal bigints', () => {
    const schema = text.bigint()
    const value = 9_007_199_254_740_993n

    expect(z.decode(schema, '9007199254740993')).toBe(value)
    expect(z.encode(schema, value)).toBe('9007199254740993')
    expect(z.safeDecode(schema, '1e3').success).toBe(false)
    expectTypeOf<z.output<typeof schema>>().toEqualTypeOf<bigint>()
  })

  test('accepts only canonical boolean text', () => {
    const schema = text.boolean()

    expect(z.decode(schema, 'true')).toBe(true)
    expect(z.decode(schema, 'false')).toBe(false)
    expect(z.encode(schema, true)).toBe('true')
    expect(schema.safeParse('TRUE').success).toBe(false)
    expect(schema.safeParse('1').success).toBe(false)
  })

  test('converts offset-qualified datetimes to valid Dates', () => {
    const schema = text.datetime()

    expect(z.decode(schema, '2026-08-06T12:00:00+02:00')).toEqual(new Date('2026-08-06T10:00:00.000Z'))
    expect(z.encode(schema, new Date('2026-08-06T10:00:00.000Z'))).toBe('2026-08-06T10:00:00.000Z')
    expect(z.safeDecode(schema, '2026-08-06T12:00:00').success).toBe(false)
    expect(z.safeDecode(schema, 'not-a-date').success).toBe(false)
    expect(z.safeEncode(schema, new Date(Number.NaN)).success).toBe(false)
  })

  test('converts JSON text through a nested schema in both directions', () => {
    const schema = text.json(
      z.object({
        name: z.string(),
        createdAt: text.datetime(),
      })
    )
    const application = { name: 'Ada', createdAt: new Date('2026-08-06T10:00:00.000Z') }

    expect(z.decode(schema, '{"name":"Ada","createdAt":"2026-08-06T10:00:00.000Z"}')).toEqual(application)
    expect(z.encode(schema, application)).toBe('{"name":"Ada","createdAt":"2026-08-06T10:00:00.000Z"}')
    expect(z.safeDecode(schema, '{invalid').success).toBe(false)
    expect(z.safeDecode(schema, '{"name":1}').success).toBe(false)
    expectTypeOf<z.input<typeof schema>>().toEqualTypeOf<string>()
    expectTypeOf<z.output<typeof schema>>().toEqualTypeOf<{
      name: string
      createdAt: Date
    }>()

    const permissive = text.json(z.any())
    const cyclic: Record<string, unknown> = {}
    cyclic['self'] = cyclic
    expect(z.safeEncode(permissive, cyclic).success).toBe(false)
    expect(z.safeEncode(permissive, undefined).success).toBe(false)
  })
})

describe('Zod route input', () => {
  test('combines router params and every route input into one native object schema', () => {
    const createdAt = z.codec(z.iso.datetime(), z.date(), {
      decode: (value) => new Date(value),
      encode: (value) => value.toISOString(),
    })
    const organizationParams = z.codec(
      z.object({ organizationId: z.string().regex(/^\d+$/) }),
      z.object({ organizationId: z.number().int() }),
      {
        decode: (value) => ({ organizationId: Number(value.organizationId) }),
        encode: (value) => ({ organizationId: String(value.organizationId) }),
      }
    )
    const create = route.post('/members/:memberId', {
      params: z.object({ memberId: text.integer() }),
      query: zodQuery(z.object({ notify: text.boolean() })),
      headers: z.object({ 'x-requested-at': createdAt }),
      body: z.object({ createdAt }),
      responses: { 201: response.json(z.object({ id: z.string() })) },
    })
    const members = router('/organizations/:organizationId', {
      params: organizationParams,
      routes: { create },
    })
    const schema = routeInput(members.create)
    const application = {
      params: { organizationId: 42, memberId: 7 },
      query: { notify: true },
      headers: { 'x-requested-at': new Date('2026-08-12T10:00:00.000Z') },
      body: { createdAt: new Date('2026-08-12T11:00:00.000Z') },
    }
    const wire: z.input<typeof schema> = {
      params: { organizationId: '42', memberId: '7' },
      query: { notify: 'true' },
      headers: { 'x-requested-at': '2026-08-12T10:00:00.000Z' },
      body: { createdAt: '2026-08-12T11:00:00.000Z' },
    }

    expect(Object.keys(schema.shape)).toEqual(['params', 'query', 'headers', 'body'])
    expect(z.encode(schema, application)).toEqual(wire)
    expect(z.decode(schema, wire)).toEqual(application)
    expectTypeOf<z.output<typeof schema>>().toExtend<ClientRouteInput<typeof members.create>>()
    expectTypeOf<ClientRouteInput<typeof members.create>>().toExtend<z.output<typeof schema>>()
    expectTypeOf<z.input<typeof schema>['query']['notify']>().toEqualTypeOf<'true' | 'false'>()
  })

  test('returns a schema users can modify with ordinary Zod APIs', () => {
    const declaration = route.post('/users', {
      body: z.object({ name: z.string(), role: z.string() }),
      responses: { 201: response.empty() },
    })
    const customized = routeInput(declaration)
      .pick({ body: true })
      .extend({ audit: z.object({ actorId: z.string() }) })

    expect(customized.parse({ body: { name: 'Ada', role: 'admin' }, audit: { actorId: 'user-1' } })).toEqual({
      body: { name: 'Ada', role: 'admin' },
      audit: { actorId: 'user-1' },
    })
    expectTypeOf<z.output<typeof customized>>().toEqualTypeOf<{
      body: { name: string; role: string }
      audit: { actorId: string }
    }>()
  })

  test('supports routes with only their own parameter schema', () => {
    const declaration = route.get('/users/:id', {
      params: z.object({ id: z.string() }),
      responses: { 200: response.empty() },
    })

    expect(Object.keys(routeInput(declaration).shape.params.shape)).toEqual(['id'])
  })

  test('rejects non-route values at the JavaScript boundary', () => {
    const compose = routeInput as unknown as (value: unknown) => unknown
    expect(() => compose(null)).toThrowError('Route input must be a route')
    expect(() => compose({ kind: 'not-a-route' })).toThrowError('Route input must be a route')
  })

  test('keeps router params scoped when a route is reused', () => {
    const read = route.get('/:id', {
      params: z.object({ id: z.string() }),
      responses: { 200: response.empty() },
    })
    const organizations = router('/organizations/:organizationId', {
      params: z.object({ organizationId: z.string() }),
      routes: { read },
    })
    const teams = router('/teams/:teamId', {
      params: z.object({ teamId: z.string() }),
      routes: { read },
    })

    expect(Object.keys(routeInput(organizations.read).shape.params.shape)).toEqual(['organizationId', 'id'])
    expect(Object.keys(routeInput(teams.read).shape.params.shape)).toEqual(['teamId', 'id'])
    expect(organizations.read).not.toBe(read)
    expect(teams.read).not.toBe(read)
  })

  test('rejects routes declared with a different validation library', () => {
    const declaration = route.post('/users', {
      body: v.object({ name: v.string() }),
      responses: { 201: response.empty() },
    })

    const rejectOtherValidatorsAtCompileTime = () => {
      // @ts-expect-error The Zod helper requires every declared input schema to be a Zod schema.
      routeInput(declaration)
    }
    expectTypeOf(rejectOtherValidatorsAtCompileTime).toBeFunction()

    const compose = routeInput as unknown as (route: unknown) => unknown
    expect(() => compose(declaration)).toThrowError('Route body must use a Zod schema')
  })
})

describe('Zod route output', () => {
  test('selects the exact Zod schema for a declared response status', () => {
    const createdAt = z.codec(z.iso.datetime(), z.date(), {
      decode: (value) => new Date(value),
      encode: (value) => value.toISOString(),
    })
    const created = zodCodec(z.object({ id: z.string(), createdAt }))
    const conflict = z.object({ code: z.literal('CONFLICT') })
    const declaration = route.post('/users', {
      responses: {
        201: response.json(created),
        204: response.empty(),
        409: response.json(conflict),
      },
    })
    const schema = routeOutput(declaration, 201)
    const application = { id: 'user-1', createdAt: new Date('2026-08-12T10:00:00.000Z') }
    const wire = { id: 'user-1', createdAt: '2026-08-12T10:00:00.000Z' }

    expect(schema).toBe(created)
    expect(z.encode(schema, application)).toEqual(wire)
    expect(z.decode(schema, wire)).toEqual(application)
    expectTypeOf(schema).toEqualTypeOf<typeof created>()
    expectTypeOf<z.input<typeof schema>>().toEqualTypeOf<typeof wire>()
    expectTypeOf<z.output<typeof schema>>().toEqualTypeOf<typeof application>()

    const rejectInvalidStatusesAtCompileTime = () => {
      // @ts-expect-error Empty responses have no complete output schema.
      routeOutput(declaration, 204)
      // @ts-expect-error The output status must be declared by this route.
      routeOutput(declaration, 200)
    }
    expectTypeOf(rejectInvalidStatusesAtCompileTime).toBeFunction()
  })
})
