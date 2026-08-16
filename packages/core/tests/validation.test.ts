import type { StandardSchemaV1 } from '@standard-schema/spec'
import * as v from 'valibot'
import { describe, expect, expectTypeOf, test } from 'vitest'
import { z } from 'zod'
import {
  asyncSchema,
  codec,
  decodeSchema,
  defineSchema,
  encodeSchema,
  isSchema,
  SchemaValidationError,
  validation,
  type AsyncSchema,
  type SchemaInput,
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

describe('Standard Schema validation', () => {
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
    const local = defineSchema({
      name: 'a string',
      check: (value: unknown): value is string => typeof value === 'string',
    })

    expect(isSchema(local)).toBe(true)
    expect(isSchema(z.string())).toBe(true)
    expect(isSchema({ '~standard': { version: 2, vendor: 'future', validate: () => ({ value: true }) } })).toBe(false)
    expect(isSchema({})).toBe(false)
  })

  test('creates dependency-free identity schemas that validate both directions', async () => {
    const positiveInteger = defineSchema({
      name: 'a positive integer',
      check: (value: unknown): value is number => Number.isInteger(value) && Number(value) > 0,
    })

    await expect(decodeSchema(positiveInteger, 42)).resolves.toBe(42)
    await expect(encodeSchema(positiveInteger, 42)).resolves.toBe(42)
    await expect(decodeSchema(positiveInteger, -1)).rejects.toMatchObject({
      name: 'SchemaValidationError',
      issues: [{ message: 'Expected a positive integer' }],
    })
    expectTypeOf<SchemaInput<typeof positiveInteger>>().toEqualTypeOf<number>()
    expectTypeOf<SchemaOutput<typeof positiveInteger>>().toEqualTypeOf<number>()
  })

  test('combines Standard Schemas into an explicitly reversible codec', async () => {
    const numberString = codec({
      decode: transformSchema(
        (value: string) => Number(value),
        (value: unknown): value is string => typeof value === 'string' && /^\d+$/.test(value),
        'Expected an integer string'
      ),
      encode: transformSchema(
        (value: number) => String(value),
        (value: unknown): value is number => Number.isInteger(value),
        'Expected an integer'
      ),
    })

    await expect(decodeSchema(numberString, '42')).resolves.toBe(42)
    await expect(encodeSchema(numberString, 42)).resolves.toBe('42')
    await expect(decodeSchema(numberString, '4.2')).rejects.toBeInstanceOf(SchemaValidationError)
    await expect(encodeSchema(numberString, 4.2)).rejects.toBeInstanceOf(SchemaValidationError)
    expectTypeOf<SchemaInput<typeof numberString>>().toEqualTypeOf<string>()
    expectTypeOf<SchemaOutput<typeof numberString>>().toEqualTypeOf<number>()
  })

  test('uses public Zod instance methods for codecs without a Zod adapter', async () => {
    const schema = z.object({
      createdAt: z.codec(z.iso.datetime(), z.date(), {
        decode: (value) => new Date(value),
        encode: (value) => value.toISOString(),
      }),
    })
    const application = { createdAt: new Date('2026-08-05T10:00:00.000Z') }
    const wire = { createdAt: '2026-08-05T10:00:00.000Z' }

    await expect(decodeSchema(schema, wire)).resolves.toEqual(application)
    await expect(encodeSchema(schema, application)).resolves.toEqual(wire)
    await expect(decodeSchema(schema, { createdAt: 'invalid' })).rejects.toBeInstanceOf(SchemaValidationError)
  })

  test('uses Valibot schemas directly for identity contracts', async () => {
    const schema = v.object({
      id: v.string(),
      active: v.boolean(),
    })
    const value = { id: 'user-1', active: true }

    expect(isSchema(schema)).toBe(true)
    await expect(decodeSchema(schema, value)).resolves.toEqual(value)
    await expect(encodeSchema(schema, value)).resolves.toEqual(value)
    await expect(decodeSchema(schema, { id: 1, active: true })).rejects.toBeInstanceOf(SchemaValidationError)
    expectTypeOf<SchemaInput<typeof schema>>().toEqualTypeOf<{
      id: string
      active: boolean
    }>()
    expectTypeOf<SchemaOutput<typeof schema>>().toEqualTypeOf<{
      id: string
      active: boolean
    }>()
  })

  test('builds directional contracts from paired Valibot schemas', async () => {
    const schema = codec({
      decode: v.object({
        createdAt: v.pipe(
          v.string(),
          v.isoTimestamp(),
          v.transform((value) => new Date(value))
        ),
      }),
      encode: v.object({
        createdAt: v.pipe(
          v.date(),
          v.transform((value) => value.toISOString())
        ),
      }),
    })
    const application = { createdAt: new Date('2026-08-05T10:00:00.000Z') }
    const wire = { createdAt: '2026-08-05T10:00:00.000Z' }

    await expect(decodeSchema(schema, wire)).resolves.toEqual(application)
    await expect(encodeSchema(schema, application)).resolves.toEqual(wire)
    await expect(decodeSchema(schema, { createdAt: 'invalid' })).rejects.toBeInstanceOf(SchemaValidationError)
    expectTypeOf<SchemaInput<typeof schema>>().toEqualTypeOf<{ createdAt: string }>()
    expectTypeOf<SchemaOutput<typeof schema>>().toEqualTypeOf<{ createdAt: Date }>()
  })

  test('uses forward validation for plain identity Standard Schemas', async () => {
    const upperCase = transformSchema(
      (value: string) => value.toUpperCase(),
      (value: unknown): value is string => typeof value === 'string',
      'Expected a string'
    )

    await expect(decodeSchema(upperCase, 'hello')).resolves.toBe('HELLO')
    await expect(encodeSchema(upperCase, 'hello')).resolves.toBe('HELLO')
  })

  test('adds optional boundary locations without replacing validator issue metadata', async () => {
    const schema = z.object({ id: z.string() })

    await expect(decodeSchema(schema, { id: 1 }, { location: 'response' })).rejects.toMatchObject({
      code: 'schema-validation',
      location: 'response',
      issues: [{ code: 'invalid_type', location: 'response', path: ['id'] }],
    })
  })
})
