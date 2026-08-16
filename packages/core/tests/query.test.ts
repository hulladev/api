import * as v from 'valibot'
import { describe, expect, expectTypeOf, test } from 'vitest'
import { z } from 'zod'
import { decodeQuery, encodeQuery, QueryTransportError } from '../src/query'
import { request } from '../src/request'
import { response } from '../src/response'
import { route } from '../src/route'
import { text } from '../src/zod'

const responses = { 200: response.json(z.object({ ok: z.literal(true) })) }

describe('query transport', () => {
  test('round-trips text-first scalars, arrays, and tuples', async () => {
    const declaration = route.get('/search', {
      query: z.object({
        search: z.string().optional(),
        page: text.integer(),
        active: text.boolean(),
        tags: z.array(z.string()).min(1),
        coordinate: z.tuple([text.number(), text.number()]),
      }),
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
    expect(declaration.query.transport.fields).toEqual({
      search: 'single',
      page: 'single',
      active: 'single',
      tags: 'repeated',
      coordinate: 'repeated',
    })
    expect(declaration.query.repeated).toEqual(['tags', 'coordinate'])
    expect(Object.isFrozen(declaration.query.transport.fields)).toBe(true)
  })

  test('decodes a singleton occurrence as an array when Zod declares one', async () => {
    const declaration = route.get('/search', {
      query: z.object({ tags: z.array(z.string()) }),
      responses,
    })

    await expect(decodeQuery(declaration.query, new URLSearchParams('tags=admin'))).resolves.toEqual({
      tags: ['admin'],
    })
  })

  test('rejects duplicate scalar values', async () => {
    const declaration = route.get('/search', {
      query: z.object({ search: z.string() }),
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
    const declaration = route.get('/search', {
      query: z.object({ tags: z.array(z.string()) }),
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
    const required = route.get('/required', {
      query: z.object({ tags: z.array(z.string()) }),
      responses,
    })
    const defaulted = route.get('/defaulted', {
      query: z.object({ tags: z.array(z.string()).default([]) }),
      responses,
    })

    await expect(decodeQuery(required.query, new URLSearchParams('tags='))).resolves.toEqual({ tags: [''] })
    await expect(decodeQuery(defaulted.query, new URLSearchParams())).resolves.toEqual({ tags: [] })
  })

  test('annotates Standard Schema failures with the query boundary', async () => {
    const declaration = route.get('/search', {
      query: z.object({ search: z.string() }),
      responses,
    })

    await expect(decodeQuery(declaration.query, new URLSearchParams())).rejects.toMatchObject({
      code: 'schema-validation',
      location: 'query',
      issues: [{ location: 'query', path: ['search'] }],
    })
  })

  test('rejects Zod unions with mixed scalar and repeated inputs at declaration time', () => {
    expect(() =>
      route.get('/search', {
        query: z.object({ value: z.union([z.string(), z.array(z.string())]) }),
        responses,
      })
    ).toThrowError(QueryTransportError)
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
