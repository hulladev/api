import { QueryTransportError, response, route } from '@hulla/api'
import { decodeSchema, encodeSchema } from '@hulla/api/validation'
import { describe, expect, test } from 'vitest'
import { z } from 'zod'
import { codec, query, text } from '../src'

describe('@hulla/api-zod', () => {
  test('adapts reversible Zod schemas explicitly', async () => {
    const schema = codec(z.object({ page: text.integer() }))
    await expect(decodeSchema(schema, { page: '2' })).resolves.toEqual({ page: 2 })
    await expect(encodeSchema(schema, { page: 2 })).resolves.toEqual({ page: '2' })
    await expect(decodeSchema(schema, { page: 'invalid' })).rejects.toMatchObject({ code: 'schema-validation' })
    await expect(encodeSchema(schema, { page: 1.5 })).rejects.toMatchObject({ code: 'schema-validation' })
  })

  test('requires explicit adaptation when wire and application types differ', async () => {
    const native = z.codec(z.iso.datetime(), z.date(), {
      decode: (value) => new Date(value),
      encode: (value) => value.toISOString(),
    })
    const date = new Date('2026-08-16T10:00:00.000Z')
    const explicit = response.json(codec(native))
    const rejectImplicitCodec = () => {
      // @ts-expect-error Core only accepts a JSON-compatible wire type; adaptation supplies the reverse schema.
      response.json(native)
    }

    await expect(encodeSchema(explicit.body.schema, date)).resolves.toBe('2026-08-16T10:00:00.000Z')
    expect(rejectImplicitCodec).toBeTypeOf('function')
    expect(explicit.body.schema).toBeInstanceOf(z.ZodType)
  })

  test('adapts asynchronous Zod validation in both directions', async () => {
    const schema = codec.async(
      z.string().refine(async (value) => value === 'accepted', {
        message: 'Expected accepted',
      })
    )

    await expect(decodeSchema(schema, 'accepted')).resolves.toBe('accepted')
    await expect(encodeSchema(schema, 'accepted')).resolves.toBe('accepted')
    await expect(decodeSchema(schema, 'rejected')).rejects.toMatchObject({ code: 'schema-validation' })
    await expect(encodeSchema(schema, 'rejected')).rejects.toMatchObject({ code: 'schema-validation' })
  })

  test('infers repeated query fields through common Zod wrappers', async () => {
    const schema = z.object({
      search: z.string().optional(),
      tags: z.array(z.string()).optional(),
      coordinates: z.tuple([text.number(), text.number()]).readonly(),
      aliases: z.lazy(() => z.array(z.string())),
      fallback: z.array(z.string()).default([]),
      alternatives: z.union([z.array(z.string()), z.tuple([z.string()])]),
    })
    const declaration = route.get('/search', {
      query: query(schema),
      responses: { 200: response.empty() },
    })

    expect(declaration.query.repeated).toEqual(['tags', 'coordinates', 'aliases', 'fallback', 'alternatives'])
    await expect(
      decodeSchema(declaration.query.schema, {
        search: 'Ada',
        tags: ['admin'],
        coordinates: ['50.08', '14.43'],
        aliases: ['countess'],
        fallback: [],
        alternatives: ['author'],
      })
    ).resolves.toEqual({
      search: 'Ada',
      tags: ['admin'],
      coordinates: [50.08, 14.43],
      aliases: ['countess'],
      fallback: [],
      alternatives: ['author'],
    })
  })

  test('keeps scalar unions singular and rejects mixed cardinality', () => {
    const scalar = query(z.object({ value: z.union([z.string(), z.literal('all')]) }))
    expect(scalar.repeated).toEqual([])

    expect(() => query(z.object({ value: z.union([z.string(), z.array(z.string())]) }))).toThrowError(
      expect.objectContaining<Partial<QueryTransportError>>({
        name: 'QueryTransportError',
        code: 'mixed-query-cardinality',
        key: 'value',
      })
    )
  })

  test('rejects non-object query schemas at the JavaScript boundary', () => {
    const declareQuery = query as unknown as (schema: z.ZodType) => unknown
    expect(() => declareQuery(z.string())).toThrowError('Zod query schemas must have an object input shape')
  })
})
