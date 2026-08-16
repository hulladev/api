import * as v from 'valibot'
import { describe, expect, expectTypeOf, test } from 'vitest'
import { z } from 'zod'
import { decodeQuery, encodeQuery } from '../src/query'
import { request } from '../src/request'
import { response } from '../src/response'
import { route } from '../src/route'
import { codec } from '../src/validation'

const responses = { 200: response.empty() }
const requiredSearchSchemas = [
  { name: 'Zod', schema: z.object({ search: z.string() }) },
  { name: 'Valibot', schema: v.object({ search: v.string() }) },
] as const

const textQuery = codec({
  decode: v.object({
    search: v.optional(v.string()),
    page: v.pipe(
      v.string(),
      v.transform((value) => Number(value))
    ),
    active: v.pipe(
      v.picklist(['true', 'false']),
      v.transform((value) => value === 'true')
    ),
    tags: v.array(v.string()),
    coordinate: v.tuple([
      v.pipe(
        v.string(),
        v.transform((value) => Number(value))
      ),
      v.pipe(
        v.string(),
        v.transform((value) => Number(value))
      ),
    ]),
  }),
  encode: v.object({
    search: v.optional(v.string()),
    page: v.pipe(
      v.number(),
      v.transform((value) => String(value))
    ),
    active: v.pipe(
      v.boolean(),
      v.transform((value) => String(value))
    ),
    tags: v.array(v.string()),
    coordinate: v.tuple([
      v.pipe(
        v.number(),
        v.transform((value) => String(value))
      ),
      v.pipe(
        v.number(),
        v.transform((value) => String(value))
      ),
    ]),
  }),
})

describe('query transport', () => {
  test('round-trips text-first scalars, arrays, and tuples', async () => {
    const declaration = route.get('/search', {
      query: request.query(textQuery, { repeated: ['tags', 'coordinate'] }),
      responses,
    })
    const value = {
      search: 'Ada Lovelace',
      page: 2,
      active: true,
      tags: ['admin', 'author'],
      coordinate: [50.08, 14.43] as [number, number],
    }

    const encoded = await encodeQuery(declaration.query, value)

    expect(encoded.toString()).toBe(
      'search=Ada+Lovelace&page=2&active=true&tags=admin&tags=author&coordinate=50.08&coordinate=14.43'
    )
    await expect(decodeQuery(declaration.query, encoded)).resolves.toEqual(value)
    expect(declaration.query.transport.fields).toEqual({ tags: 'repeated', coordinate: 'repeated' })
    expect(declaration.query.repeated).toEqual(['tags', 'coordinate'])
    expect(Object.isFrozen(declaration.query.transport.fields)).toBe(true)
  })

  test('decodes a singleton occurrence as an explicitly repeated field', async () => {
    const schema = v.object({ tags: v.array(v.string()) })
    const declaration = route.get('/search', {
      query: request.query(schema, { repeated: ['tags'] }),
      responses,
    })

    await expect(decodeQuery(declaration.query, new URLSearchParams('tags=admin'))).resolves.toEqual({
      tags: ['admin'],
    })
  })

  test('rejects duplicate scalar values', async () => {
    const declaration = route.get('/search', {
      query: v.object({ search: v.string() }),
      responses,
    })

    await expect(decodeQuery(declaration.query, new URLSearchParams('search=a&search=b'))).rejects.toMatchObject({
      name: 'QueryTransportError',
      code: 'duplicate-query-value',
      key: 'search',
      issues: [{ code: 'duplicate-query-value', location: 'query', path: ['search'] }],
    })
  })

  test('rejects explicit empty arrays during encoding', async () => {
    const schema = v.object({ tags: v.array(v.string()) })
    const declaration = route.get('/search', {
      query: request.query(schema, { repeated: ['tags'] }),
      responses,
    })

    await expect(encodeQuery(declaration.query, { tags: [] })).rejects.toMatchObject({
      name: 'QueryTransportError',
      code: 'empty-query-array',
      key: 'tags',
      issues: [{ code: 'empty-query-array', location: 'query', path: ['tags'] }],
    })
  })

  test('treats an empty value as one empty string and lets defaults produce empty arrays', async () => {
    const requiredSchema = v.object({ tags: v.array(v.string()) })
    const defaultedSchema = v.object({ tags: v.optional(v.array(v.string()), []) })
    const required = route.get('/required', {
      query: request.query(requiredSchema, { repeated: ['tags'] }),
      responses,
    })
    const defaulted = route.get('/defaulted', {
      query: request.query(defaultedSchema, { repeated: ['tags'] }),
      responses,
    })

    await expect(decodeQuery(required.query, new URLSearchParams('tags='))).resolves.toEqual({ tags: [''] })
    await expect(decodeQuery(defaulted.query, new URLSearchParams())).resolves.toEqual({ tags: [] })
  })

  test.each(requiredSearchSchemas)('annotates $name failures with the query boundary', async ({ schema }) => {
    const declaration = route.get('/search', {
      query: schema,
      responses,
    })

    await expect(decodeQuery(declaration.query, new URLSearchParams())).rejects.toMatchObject({
      code: 'schema-validation',
      location: 'query',
      issues: [{ location: 'query' }],
    })
  })

  test('uses explicit repeated metadata for opaque Standard Schemas', async () => {
    const schema = v.object({
      search: v.optional(v.string()),
      tags: v.array(v.string()),
    })
    const declaration = route.get('/search', {
      query: request.query(schema, { repeated: ['tags'] }),
      responses,
    })
    const value = { search: 'Ada', tags: ['admin'] }

    const encoded = await encodeQuery(declaration.query, value)

    expect(encoded.toString()).toBe('search=Ada&tags=admin')
    await expect(decodeQuery(declaration.query, encoded)).resolves.toEqual(value)
    expectTypeOf(declaration.query.schema).toEqualTypeOf<typeof schema>()
  })
})
