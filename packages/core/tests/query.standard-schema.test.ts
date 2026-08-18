import { describe, expect, expectTypeOf, test } from 'vitest'
import { z } from 'zod'
import { compileQueryDecoder, compileQueryEncoder, normalizeRequestQuery } from '../src/query'
import { codec, type ObjectSchema } from '../src/validation'

function queryPlan<const Schema extends ObjectSchema>(schema: Schema) {
  return normalizeRequestQuery(schema)
}

describe('query transport', () => {
  test('round-trips flat scalar and repeated array inputs without schema introspection', async () => {
    const query = queryPlan(
      codec(
        z.object({
          search: z.string().optional(),
          page: z.string(),
          active: z.enum(['true', 'false']),
          tags: z.array(z.string()),
          coordinate: z.tuple([z.string(), z.string()]),
        }),
        z.object({
          search: z.string().optional(),
          page: z.number().int(),
          active: z.boolean(),
          tags: z.array(z.string()),
          coordinate: z.tuple([z.number(), z.number()]),
        }),
        {
          decode: (value) => ({
            ...value,
            page: Number(value.page),
            active: value.active === 'true',
            coordinate: value.coordinate.map(Number) as [number, number],
          }),
          encode: (value) => ({
            ...value,
            page: String(value.page),
            active: value.active ? ('true' as const) : ('false' as const),
            coordinate: value.coordinate.map(String) as [string, string],
          }),
        }
      )
    )
    const application = {
      search: 'Ada Lovelace',
      page: 2,
      active: true,
      tags: ['admin', 'author'],
      coordinate: [50.08, 14.43] as [number, number],
    }

    const encoded = await compileQueryEncoder(query)(application)

    expect(encoded.toString()).toBe(
      'search=Ada+Lovelace&page=2&active=true&tags=admin&tags=author&coordinate=50.08&coordinate=14.43'
    )
    expect(compileQueryDecoder(query)(encoded)).toEqual(application)
  })

  test('leaves singleton-versus-array normalization to the schema', () => {
    const oneOrMany = z
      .union([z.string(), z.array(z.string())])
      .transform((value) => (Array.isArray(value) ? value : [value]))
    const query = queryPlan(z.object({ tags: oneOrMany }))

    expect(compileQueryDecoder(query)(new URLSearchParams('tags=admin'))).toEqual({ tags: ['admin'] })
    expect(compileQueryDecoder(query)(new URLSearchParams('tags=admin&tags=author'))).toEqual({
      tags: ['admin', 'author'],
    })
  })

  test('rejects nested objects and arrays', () => {
    const query = queryPlan(z.object({ filter: z.unknown() }))

    expect(() => compileQueryEncoder(query)({ filter: { role: 'admin' } })).toThrowError(
      'Query field "filter" must be a string, flat string array, or undefined'
    )
    expect(() => compileQueryEncoder(query)({ filter: [['admin']] })).toThrowError(
      'Query field "filter" must be a string, flat string array, or undefined'
    )
  })

  test('rejects explicit empty arrays during encoding', () => {
    const query = queryPlan(z.object({ tags: z.array(z.string()) }))
    expect(() => compileQueryEncoder(query)({ tags: [] })).toThrowError(
      'Query field "tags" cannot encode an empty array'
    )
  })

  test('lets schema defaults produce empty arrays when the field is absent', () => {
    const query = queryPlan(z.object({ tags: z.array(z.string()).default([]) }))
    expect(compileQueryDecoder(query)(new URLSearchParams())).toEqual({ tags: [] })
  })

  test('annotates validation failures with the query boundary', () => {
    const schema = z.object({ search: z.string() })
    const query = queryPlan(schema)

    expect(() => compileQueryDecoder(query)(new URLSearchParams())).toThrowError(
      expect.objectContaining({
        code: 'schema-validation',
        location: 'query',
        issues: [expect.objectContaining({ location: 'query' })],
      })
    )
    expectTypeOf(query.schema).toEqualTypeOf<typeof schema>()
  })
})
