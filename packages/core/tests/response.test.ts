import * as v from 'valibot'
import { describe, expect, expectTypeOf, test } from 'vitest'
import { z } from 'zod'
import {
  bytes as bytesResponse,
  empty as emptyResponse,
  formData as formDataResponse,
  json as jsonResponse,
  raw as rawResponse,
  response,
  routeOutput,
  stream as streamResponse,
  text as textResponse,
  type AnyRouteResponse,
  type JsonValue,
} from '../src/contract/response'
import { route } from '../src/contract/route'
import { codec, decodeSchema, encodeSchema, type SchemaInput, type SchemaOutput } from '../src/validation'

describe('response declaration', () => {
  test('exposes individually importable factories and the ergonomic namespace', () => {
    const schema = z.literal('ok')

    expect(response).toEqual({
      json: jsonResponse,
      text: textResponse,
      bytes: bytesResponse,
      formData: formDataResponse,
      stream: streamResponse,
      raw: rawResponse,
      empty: emptyResponse,
    })
    expect(jsonResponse(schema)).toEqual(response.json(schema))
  })

  test('creates inspectable and immutable response metadata', () => {
    const headers = z.object({ etag: z.string() })
    const schema = z.object({ message: z.string() })
    const declaration = response.json(schema, { headers })

    expect(declaration).toEqual({
      kind: 'response',
      body: { kind: 'json', schema },
      headers,
      contentType: 'application/json',
    })
    expect(Object.isFrozen(declaration)).toBe(true)
    expect(Object.isFrozen(declaration.body)).toBe(true)
    expectTypeOf(declaration.body.schema).toEqualTypeOf<typeof schema>()
    expectTypeOf(declaration.headers).toEqualTypeOf<typeof headers>()
    expectTypeOf(declaration.contentType).toEqualTypeOf<'application/json'>()
  })

  test('uses concrete identity schemas when body schemas are omitted', async () => {
    const json = response.json()
    const text = response.text()
    const bytes = response.bytes()
    const formData = response.formData()

    await expect(decodeSchema(json.body.schema, { message: 'hello' })).resolves.toEqual({ message: 'hello' })
    await expect(decodeSchema(text.body.schema, 'hello')).resolves.toBe('hello')

    const binaryValue = new Uint8Array([1, 2, 3])
    await expect(decodeSchema(bytes.body.schema, binaryValue)).resolves.toBe(binaryValue)

    const formDataValue = new FormData()
    await expect(decodeSchema(formData.body.schema, formDataValue)).resolves.toBe(formDataValue)

    expectTypeOf<SchemaInput<typeof json.body.schema>>().toExtend<JsonValue>()
    expectTypeOf<SchemaOutput<typeof json.body.schema>>().toExtend<JsonValue>()
    expectTypeOf<SchemaInput<typeof text.body.schema>>().toEqualTypeOf<string>()
    expectTypeOf<SchemaOutput<typeof text.body.schema>>().toEqualTypeOf<string>()
    expectTypeOf<SchemaInput<typeof bytes.body.schema>>().toExtend<Uint8Array>()
    expectTypeOf<SchemaOutput<typeof bytes.body.schema>>().toExtend<Uint8Array>()
    expectTypeOf<SchemaInput<typeof formData.body.schema>>().toEqualTypeOf<FormData>()
    expectTypeOf<SchemaOutput<typeof formData.body.schema>>().toEqualTypeOf<FormData>()
  })

  test('uses an explicit schema to narrow JSON responses', () => {
    const jsonSchema = z.object({ message: z.string() })
    const json = response.json(jsonSchema)

    expect(json.body.schema).toBe(jsonSchema)
    expectTypeOf(json.body.schema).toEqualTypeOf<typeof jsonSchema>()
  })

  test('selects exact response schemas by a declared schema-backed status', () => {
    const created = z.object({ id: z.string() })
    const conflict = z.object({ code: z.literal('CONFLICT') })
    const declaration = route.post('/users', {
      responses: {
        201: response.json(created),
        204: response.empty(),
        409: response.json(conflict),
      },
    })

    expect(routeOutput(declaration, 201)).toBe(created)
    expect(routeOutput(declaration, 409)).toBe(conflict)
    expectTypeOf(routeOutput(declaration, 201)).toEqualTypeOf<typeof created>()
    expectTypeOf(routeOutput(declaration, 409)).toEqualTypeOf<typeof conflict>()

    const rejectStatusesWithoutSchemasAtCompileTime = () => {
      // @ts-expect-error Empty responses do not have a complete body schema.
      routeOutput(declaration, 204)
      // @ts-expect-error The status must be declared by this route.
      routeOutput(declaration, 200)
    }
    expectTypeOf(rejectStatusesWithoutSchemasAtCompileTime).toBeFunction()
  })

  test('rejects invalid runtime response schema selections', () => {
    const declaration = route.get('/health', {
      responses: { 204: response.empty() },
    })
    const select = routeOutput as unknown as (route: unknown, status: number) => unknown

    expect(() => select(declaration, 200)).toThrowError('Route does not declare response status 200')
    expect(() => select(declaration, 204)).toThrowError('Route response 204 does not declare a complete body schema')
  })

  test('uses native JSON values and checks non-JSON representations without Zod', async () => {
    const json = response.json()
    const text = response.text()
    const bytes = response.bytes()
    const formData = response.formData()

    await expect(decodeSchema(json.body.schema, { nested: [true, null, 1] })).resolves.toEqual({
      nested: [true, null, 1],
    })
    await expect(decodeSchema(json.body.schema, { value: undefined })).resolves.toEqual({ value: undefined })
    await expect(decodeSchema(json.body.schema, Number.POSITIVE_INFINITY)).resolves.toBe(Infinity)
    await expect(decodeSchema(text.body.schema, 1)).rejects.toBeInstanceOf(TypeError)
    await expect(decodeSchema(bytes.body.schema, new Blob())).rejects.toBeInstanceOf(TypeError)
    await expect(decodeSchema(formData.body.schema, {})).rejects.toBeInstanceOf(TypeError)
  })

  test('accepts options without requiring the identity schema to be repeated', async () => {
    const headers = z.object({ etag: z.string() })
    const json = response.json({ headers })
    const csv = response.text({ contentType: 'text/csv; charset=utf-8', headers })
    const binary = response.bytes({ headers })

    await expect(decodeSchema(json.body.schema, { cached: true })).resolves.toEqual({ cached: true })
    expect(json.headers).toBe(headers)
    expect(csv).toMatchObject({
      body: { kind: 'text' },
      contentType: 'text/csv; charset=utf-8',
      headers,
    })
    await expect(decodeSchema(csv.body.schema, 'a,b')).resolves.toBe('a,b')
    expect(binary.contentType).toBe('application/octet-stream')
    expectTypeOf(csv.contentType).toEqualTypeOf<'text/csv; charset=utf-8'>()
    expectTypeOf(csv.headers).toEqualTypeOf<typeof headers>()
    expectTypeOf(binary.contentType).toEqualTypeOf<'application/octet-stream'>()
  })

  test('supports explicit codecs for every schema-backed body representation', async () => {
    const dateCodec = codec(z.iso.datetime(), z.date(), {
      decode: (value) => new Date(value),
      encode: (value) => value.toISOString(),
    })
    const bytesCodec = codec(z.instanceof(Uint8Array), z.string(), {
      decode: (value) => new TextDecoder().decode(value),
      encode: (value) => new TextEncoder().encode(value),
    })
    const formDataCodec = codec(z.instanceof(FormData), z.object({ name: z.string() }), {
      decode: (value) => ({ name: z.string().parse(value.get('name')) }),
      encode: (value) => {
        const result = new FormData()
        result.set('name', value.name)
        return result
      },
    })
    const json = response.json(dateCodec)
    const text = response.text(dateCodec)
    const bytes = response.bytes(bytesCodec)
    const formData = response.formData(formDataCodec)
    const date = new Date('2026-08-04T10:00:00.000Z')
    const encodedFormData = new FormData()
    encodedFormData.set('name', 'Ada')

    await expect(decodeSchema(json.body.schema, '2026-08-04T10:00:00.000Z')).resolves.toEqual(date)
    await expect(decodeSchema(text.body.schema, '2026-08-04T10:00:00.000Z')).resolves.toEqual(date)
    await expect(decodeSchema(bytes.body.schema, new TextEncoder().encode('hello'))).resolves.toBe('hello')
    await expect(decodeSchema(formData.body.schema, encodedFormData)).resolves.toEqual({ name: 'Ada' })
    await expect(encodeSchema(json.body.schema, date)).resolves.toBe(date.toISOString())
    await expect(encodeSchema(text.body.schema, date)).resolves.toBe(date.toISOString())
    await expect(encodeSchema(bytes.body.schema, 'hello')).resolves.toEqual(new TextEncoder().encode('hello'))
    await expect(encodeSchema(formData.body.schema, { name: 'Ada' })).resolves.toEqual(encodedFormData)

    expectTypeOf<SchemaInput<typeof json.body.schema>>().toEqualTypeOf<string>()
    expectTypeOf<SchemaOutput<typeof json.body.schema>>().toEqualTypeOf<Date>()
    expectTypeOf<SchemaInput<typeof text.body.schema>>().toEqualTypeOf<string>()
    expectTypeOf<SchemaOutput<typeof text.body.schema>>().toEqualTypeOf<Date>()
    expectTypeOf<SchemaInput<typeof bytes.body.schema>>().toExtend<Uint8Array>()
    expectTypeOf<SchemaOutput<typeof bytes.body.schema>>().toEqualTypeOf<string>()
    expectTypeOf<SchemaInput<typeof formData.body.schema>>().toEqualTypeOf<FormData>()
    expectTypeOf<SchemaOutput<typeof formData.body.schema>>().toEqualTypeOf<{ name: string }>()
  })

  test.each([
    { name: 'Zod', schema: z.object({ message: z.string(), detail: z.string().optional() }) },
    { name: 'Valibot', schema: v.object({ message: v.string(), detail: v.optional(v.string()) }) },
  ])('allows optional $name JSON properties to be omitted on the wire', async ({ schema }) => {
    const declaration = response.json(schema)

    await expect(decodeSchema(declaration.body.schema, { message: 'hello' })).resolves.toEqual({ message: 'hello' })
  })

  test('supports explicit schemas and media types for every body representation', () => {
    const json = response.json(z.literal('ok'), { contentType: 'application/problem+json' })
    const text = response.text(z.literal('accepted'), { contentType: 'text/csv; charset=utf-8' })
    const bytes = response.bytes(z.instanceof(Uint8Array))
    const formData = response.formData(z.instanceof(FormData))
    const stream = response.stream({ contentType: 'text/event-stream' })
    const empty = response.empty({ headers: z.object({ etag: z.string() }) })

    expect(json.contentType).toBe('application/problem+json')
    expect(text.contentType).toBe('text/csv; charset=utf-8')
    expect(bytes.body.kind).toBe('bytes')
    expect(formData.body.kind).toBe('form-data')
    expect(stream).toMatchObject({ body: { kind: 'stream' }, contentType: 'text/event-stream' })
    expect(empty).toMatchObject({ body: { kind: 'empty' }, contentType: undefined })
    expectTypeOf(json.contentType).toEqualTypeOf<'application/problem+json'>()
    expectTypeOf(text.contentType).toEqualTypeOf<'text/csv; charset=utf-8'>()
    expectTypeOf(empty.contentType).toEqualTypeOf<undefined>()
  })

  test('declares raw responses without competing body metadata', () => {
    const declaration = response.raw()
    const rawRoute = route.get('/raw', { responses: { 200: declaration } })

    expect(declaration).toEqual({
      kind: 'response',
      body: { kind: 'raw' },
      headers: undefined,
      contentType: undefined,
    })
    expect(Object.isFrozen(declaration)).toBe(true)
    expect(Object.isFrozen(declaration.body)).toBe(true)
    expect(rawRoute.responses[200]).toBe(declaration)
    expectTypeOf(declaration).toExtend<AnyRouteResponse>()
    expectTypeOf(declaration.body.kind).toEqualTypeOf<'raw'>()
    expectTypeOf(declaration.headers).toEqualTypeOf<undefined>()
    expectTypeOf(declaration.contentType).toEqualTypeOf<undefined>()
  })

  // oxlint-disable-next-line vitest/expect-expect -- This test is enforced by TypeScript diagnostics.
  test('requires schemas to encode to the representation selected by the helper', () => {
    // @ts-expect-error Text responses must encode to strings.
    response.text(z.number())

    // @ts-expect-error JSON responses cannot encode bigint values.
    response.json(z.bigint())

    // @ts-expect-error Dates require a JSON-compatible codec.
    response.json(z.object({ createdAt: z.date() }))

    // @ts-expect-error Byte responses use Uint8Array as their transport representation.
    response.bytes(z.instanceof(Blob))

    // @ts-expect-error Form-data responses must encode to FormData.
    response.formData(z.string())

    // @ts-expect-error Valibot text responses must encode to strings.
    response.text(v.number())

    // @ts-expect-error Valibot JSON responses cannot encode bigint values.
    response.json(v.bigint())

    // @ts-expect-error Valibot dates require a JSON-compatible codec.
    response.json(v.object({ createdAt: v.date() }))

    // @ts-expect-error Valibot byte responses use Uint8Array on the wire.
    response.bytes(v.instance(Blob))

    // @ts-expect-error Valibot form-data responses must encode to FormData.
    response.formData(v.string())
  })

  // oxlint-disable-next-line vitest/expect-expect -- This test is enforced by TypeScript diagnostics.
  test('requires response headers to be an object Standard Schema', () => {
    response.json(z.string(), {
      // @ts-expect-error Response headers describe named fields and must produce an object.
      headers: z.string(),
    })

    // @ts-expect-error Response headers describe named fields and must produce an object.
    response.text({ headers: z.string() })

    response.json(v.string(), {
      // @ts-expect-error Valibot response headers must also produce an object.
      headers: v.string(),
    })
  })

  // oxlint-disable-next-line vitest/expect-expect -- This test is enforced by TypeScript diagnostics.
  test('requires response descriptors in the status mapping', () => {
    route.get('/legacy', {
      responses: {
        // @ts-expect-error A response schema must declare its HTTP representation through a helper.
        200: z.string(),
      },
    })
  })
})
