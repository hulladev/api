import { describe, expect, expectTypeOf, test } from 'vitest'
import { z } from 'zod'
import { decodeRequestBody, encodeRequestBody, matchesContentType, mimeEssence, request } from '../src/request'
import { response } from '../src/response'
import { route } from '../src/route'
import { text } from '../src/zod'

describe('request declarations', () => {
  test('normalizes naked body schemas to JSON metadata', () => {
    const schema = z.object({ name: z.string() })
    const declaration = route.post('/users', {
      body: schema,
      responses: { 200: response.json(z.object({ ok: z.literal(true) })) },
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

  test('matches media types by MIME essence', () => {
    const json = request.json()
    const formData = request.formData()

    expect(mimeEssence(' Application/JSON ; charset=utf-8')).toBe('application/json')
    expect(matchesContentType(json, 'application/json; charset=utf-8')).toBe(true)
    expect(matchesContentType(formData, 'multipart/form-data; boundary=abc')).toBe(true)
    expect(matchesContentType(json, 'text/plain')).toBe(false)
  })

  test('encodes and decodes representation schemas directionally', async () => {
    const body = request.json(
      z.object({
        createdAt: text.datetime(),
      })
    )
    const application = { createdAt: new Date('2026-08-06T10:00:00.000Z') }

    await expect(encodeRequestBody(body, application)).resolves.toEqual({
      body: { createdAt: '2026-08-06T10:00:00.000Z' },
      contentType: 'application/json',
    })
    await expect(
      decodeRequestBody(body, { createdAt: '2026-08-06T10:00:00.000Z' }, 'application/json; charset=utf-8')
    ).resolves.toEqual(application)
    await expect(decodeRequestBody(body, {}, 'text/plain')).rejects.toThrow('Expected request content type')
  })

  test('supports custom content types without changing representation', () => {
    const body = request.json(z.object({ title: z.string() }), {
      contentType: 'application/problem+json',
    })

    expect(body.representation).toBe('json')
    expect(body.contentType).toBe('application/problem+json')
    expectTypeOf(body.contentType).toEqualTypeOf<'application/problem+json'>()
  })

  test('rejects malformed repeated query metadata for JavaScript consumers', () => {
    const schema = z.object({ tags: z.array(z.string()) })

    expect(() => request.query(schema, { repeated: ['tags', 'tags'] })).toThrow(
      'Request query repeated key "tags" is declared more than once'
    )
  })
})
