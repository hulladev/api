import * as v from 'valibot'
import { describe, expect, expectTypeOf, test } from 'vitest'
import { z } from 'zod'
import { mimeEssence, request } from '../src/request'
import { response } from '../src/response'
import { route } from '../src/route'

describe('request declarations', () => {
  test.each([
    { name: 'Zod', schema: z.object({ name: z.string() }) },
    { name: 'Valibot', schema: v.object({ name: v.string() }) },
  ])('normalizes naked $name body schemas to JSON metadata', ({ schema }) => {
    const declaration = route.post('/users', {
      body: schema,
      responses: { 200: response.empty() },
    })

    expect(declaration.body).toEqual({
      kind: 'request-body',
      representation: 'json',
      schema,
      contentType: 'application/json',
    })
    expect(Object.isFrozen(declaration.body)).toBe(true)
    expectTypeOf(declaration.body.schema).toEqualTypeOf<typeof schema>()
  })

  test('declares explicit body representations with identity defaults', () => {
    const json = request.json()
    const textBody = request.text()
    const bytes = request.bytes()
    const formData = request.formData()

    expect(json).toMatchObject({ representation: 'json', contentType: 'application/json' })
    expect(textBody).toMatchObject({ representation: 'text', contentType: 'text/plain' })
    expect(bytes).toMatchObject({ representation: 'bytes', contentType: 'application/octet-stream' })
    expect(formData).toMatchObject({ representation: 'form-data', contentType: 'multipart/form-data' })
  })

  test('normalizes media types to their MIME essence', () => {
    expect(mimeEssence(' Application/JSON ; charset=utf-8')).toBe('application/json')
    expect(mimeEssence('multipart/form-data; boundary=abc')).toBe('multipart/form-data')
    expect(mimeEssence('')).toBe('')
  })

  test('supports custom content types without changing representation', () => {
    const body = request.json(z.object({ title: z.string() }), {
      contentType: 'application/problem+json',
    })

    expect(body.representation).toBe('json')
    expect(body.contentType).toBe('application/problem+json')
    expectTypeOf(body.contentType).toEqualTypeOf<'application/problem+json'>()
  })
})
