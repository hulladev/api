import type { StandardSchemaV1 } from '@standard-schema/spec'
import * as v from 'valibot'
import { describe, expect, expectTypeOf, test } from 'vitest'
import { z } from 'zod'
import {
  asyncSchema,
  codec,
  compileSchemaExecution,
  decodeSchema,
  encodeSchema,
  isSchema,
  SchemaValidationError,
  validation,
  type AsyncSchema,
  type SchemaInput,
  type SchemaOutbound,
  type SchemaOutput,
} from '../src/validation'

function transformSchema<Input, Output>(
  transform: (value: Input) => Output,
  check: (value: unknown) => value is Input,
  message: string
): StandardSchemaV1<Input, Output> {
  return {
    '~standard': {
      version: 1,
      vendor: 'test',
      validate: (value: unknown) => (check(value) ? { value: transform(value) } : { issues: [{ message }] }),
    },
  }
}

const zodIdentity = z.object({ id: z.string(), active: z.boolean() })
const valibotIdentity = v.object({ id: v.string(), active: v.boolean() })
const identitySchemas = [
  { name: 'Zod', schema: zodIdentity },
  { name: 'Valibot', schema: valibotIdentity },
] as const

const zodDateCodec = z.object({
  createdAt: z.codec(z.iso.datetime(), z.date(), {
    decode: (value) => new Date(value),
    encode: (value) => value.toISOString(),
  }),
})
describe('Standard Schema validation', () => {
  test.each([
    { name: 'Zod', schema: z.string() },
    { name: 'Valibot', schema: v.string() },
  ])('caches compiled $name schema execution by schema and boundary', ({ schema }) => {
    const body = compileSchemaExecution(schema, { location: 'body' })

    expect(compileSchemaExecution(schema, { location: 'body' })).toBe(body)
    expect(compileSchemaExecution(schema, { location: 'response' })).not.toBe(body)
    expect(body.decode('value')).toBe('value')
  })

  test('marks asynchronous schemas without mutating validator-owned objects', async () => {
    const schema: StandardSchemaV1<string> = {
      '~standard': {
        version: 1,
        vendor: 'async-test',
        validate: async (value) =>
          typeof value === 'string' ? { value } : { issues: [{ message: 'Expected a string' }] },
      },
    }
    const marked = validation.async(schema)

    expect(marked).not.toBe(schema)
    expect(Object.keys(marked)).toEqual(['~standard'])
    expect(asyncSchema(marked)).toBe(marked)
    await expect(decodeSchema(marked, 'hello')).resolves.toBe('hello')
    expectTypeOf(marked).toEqualTypeOf<AsyncSchema<typeof schema>>()
  })

  test('recognizes schemas structurally', () => {
    const local = transformSchema(
      (value: string) => value,
      (value: unknown): value is string => typeof value === 'string',
      'Expected a string'
    )

    expect(isSchema(local)).toBe(true)
    expect(isSchema(z.string())).toBe(true)
    expect(isSchema(v.string())).toBe(true)
    expect(isSchema({ '~standard': { version: 2, vendor: 'future', validate: () => ({ value: true }) } })).toBe(false)
    expect(isSchema({})).toBe(false)
  })

  test.each(identitySchemas)('uses $name schemas directly for identity contracts', async ({ schema }) => {
    const value = { id: 'user-1', active: true }

    expect(isSchema(schema)).toBe(true)
    await expect(decodeSchema(schema, value)).resolves.toEqual(value)
    await expect(decodeSchema(schema, { id: 1, active: true })).rejects.toBeInstanceOf(SchemaValidationError)
  })

  test('preserves identity types from both validators', () => {
    expectTypeOf<SchemaInput<typeof zodIdentity>>().toEqualTypeOf<{ id: string; active: boolean }>()
    expectTypeOf<SchemaOutput<typeof zodIdentity>>().toEqualTypeOf<{ id: string; active: boolean }>()
    expectTypeOf<SchemaInput<typeof valibotIdentity>>().toEqualTypeOf<{ id: string; active: boolean }>()
    expectTypeOf<SchemaOutput<typeof valibotIdentity>>().toEqualTypeOf<{ id: string; active: boolean }>()
  })

  test('uses Standard Schema forward transforms for native directional schemas', async () => {
    const schema = zodDateCodec
    const application = { createdAt: new Date('2026-08-05T10:00:00.000Z') }
    const wire = { createdAt: '2026-08-05T10:00:00.000Z' }

    await expect(decodeSchema(schema, wire)).resolves.toEqual(application)
    await expect(decodeSchema(schema, { createdAt: 'invalid' })).rejects.toBeInstanceOf(SchemaValidationError)
  })

  test('combines representation schemas and explicit transforms into a codec', async () => {
    const numberString = codec(z.string().regex(/^\d+$/), z.number().int(), {
      decode: Number,
      encode: String,
    })

    await expect(decodeSchema(numberString, '42')).resolves.toBe(42)
    await expect(encodeSchema(numberString, 42)).resolves.toBe('42')
    await expect(decodeSchema(numberString, '4.2')).rejects.toBeInstanceOf(SchemaValidationError)
    await expect(encodeSchema(numberString, 4.2)).rejects.toBeInstanceOf(SchemaValidationError)
    expectTypeOf<SchemaInput<typeof numberString>>().toEqualTypeOf<string>()
    expectTypeOf<SchemaOutput<typeof numberString>>().toEqualTypeOf<number>()
    expectTypeOf<SchemaOutbound<typeof numberString>>().toEqualTypeOf<number>()
  })

  test('supports codecs built from different Standard Schema vendors', async () => {
    const date = codec(v.string(), v.date(), {
      decode: (value) => new Date(value),
      encode: (value) => value.toISOString(),
    })
    const value = new Date('2026-08-17T12:00:00.000Z')

    await expect(decodeSchema(date, value.toISOString())).resolves.toEqual(value)
    await expect(encodeSchema(date, value)).resolves.toBe(value.toISOString())
  })

  test('does not promote ordinary directional schemas to codecs', () => {
    const directional = z.string().transform(Number)
    const nativeZodCodec = z.codec(z.string(), z.number(), { decode: Number, encode: String })

    expect(compileSchemaExecution(directional).encode).toBeUndefined()
    expect(compileSchemaExecution(nativeZodCodec).encode).toBeUndefined()
    expectTypeOf<SchemaOutbound<typeof directional>>().toEqualTypeOf<string>()
    expectTypeOf<SchemaOutbound<typeof nativeZodCodec>>().toEqualTypeOf<string>()
  })

  // oxlint-disable-next-line vitest/expect-expect -- This test is enforced by TypeScript diagnostics.
  test('requires identity representation schemas at codec endpoints', () => {
    void (() => {
      codec(
        // @ts-expect-error Type-changing transforms belong in codec decode.
        z.string().transform(Number),
        z.number(),
        { decode: Number, encode: String }
      )

      codec(
        // @ts-expect-error Coercion belongs in codec decode.
        z.coerce.number(),
        z.number(),
        { decode: Number, encode: Number }
      )
    })
  })

  test('preserves native Zod directional types', () => {
    expectTypeOf<SchemaInput<typeof zodDateCodec>>().toEqualTypeOf<{ createdAt: string }>()
    expectTypeOf<SchemaOutput<typeof zodDateCodec>>().toEqualTypeOf<{ createdAt: Date }>()
  })

  test('uses forward validation for plain identity Standard Schemas', async () => {
    const upperCase = transformSchema(
      (value: string) => value.toUpperCase(),
      (value: unknown): value is string => typeof value === 'string',
      'Expected a string'
    )

    await expect(decodeSchema(upperCase, 'hello')).resolves.toBe('HELLO')
  })

  test.each(identitySchemas)('adds locations to $name issues without replacing their metadata', async ({ schema }) => {
    await expect(decodeSchema(schema, { id: 1, active: true }, { location: 'response' })).rejects.toMatchObject({
      code: 'schema-validation',
      location: 'response',
      issues: [{ location: 'response' }],
    })
  })
})
