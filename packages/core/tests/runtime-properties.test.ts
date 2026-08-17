import { describe, expect, test } from 'vitest'
import { z } from 'zod'
import { defineContract, response, route } from '../src'
import { defineClient } from '../src/client'
import { defineServer } from '../src/server'
import { createFetchHandler } from '../src/server'

const contract = defineContract({
  routes: {
    item: route.get('/items/:id', {
      params: z.object({ id: z.string() }),
      responses: { 200: response.text() },
    }),
    search: route.get('/search', {
      query: z.object({ term: z.string() }),
      responses: { 200: response.text() },
    }),
    echo: route.post('/echo', {
      body: z.object({ value: z.string() }),
      responses: { 200: response.json(z.object({ value: z.string() })) },
    }),
  },
})

const server = defineServer(contract)
const handler = createFetchHandler(
  server.build({
    item: (input) => ({ status: 200, body: input.params.id }),
    search: (input) => ({ status: 200, body: input.query.term }),
    echo: (input) => ({ status: 200, body: input.body }),
  })
)
const client = defineClient(contract, { baseUrl: 'https://property.test', fetch: handler }).build()

describe('runtime transport properties', () => {
  test('round-trips encoded path values through compiled client and server plans', async () => {
    const values = [
      '',
      'simple',
      'with spaces',
      'slash/value',
      '100%',
      'café',
      '日本語',
      '🚀',
      ...Array.from({ length: 40 }, (_, index) => `segment-${index}-${String.fromCodePoint(0x3b1 + (index % 20))}`),
    ]

    for (const value of values) {
      await expect(client.item({ params: { id: value } })).resolves.toMatchObject({ status: 200, body: value })
    }
  })

  test('rejects malformed percent encodings and duplicate scalar queries deterministically', async () => {
    for (const pathname of ['/items/%', '/items/%2', '/items/%GG', '/items/value%ZZtail']) {
      const result = await handler(new Request(`https://property.test${pathname}`))
      expect(result.status).toBe(400)
    }

    for (const query of ['term=one&term=two', 'term=&term=', 'term=one&term=two&term=three']) {
      const result = await handler(new Request(`https://property.test/search?${query}`))
      expect(result.status).toBe(400)
    }
  })

  test('normalizes MIME casing, whitespace, and parameters without weakening matching', async () => {
    for (const contentType of [
      'application/json',
      'APPLICATION/JSON',
      'application/json; charset=utf-8',
      ' application/json ; charset=UTF-8 ',
    ]) {
      const result = await handler(
        new Request('https://property.test/echo', {
          method: 'POST',
          headers: { 'content-type': contentType },
          body: JSON.stringify({ value: contentType }),
        })
      )
      expect(result.status).toBe(200)
      expect(await result.json()).toEqual({ value: contentType })
    }

    const rejected = await handler(
      new Request('https://property.test/echo', {
        method: 'POST',
        headers: { 'content-type': 'application/problem+json' },
        body: JSON.stringify({ value: 'wrong MIME' }),
      })
    )
    expect(rejected.status).toBe(415)
  })
})
