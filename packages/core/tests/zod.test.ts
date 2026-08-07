import { describe, expect, expectTypeOf, test } from 'vitest'
import { z } from 'zod'
import { text } from '../src/zod'

describe('Zod text codecs', () => {
  test('converts strict safe integers in both directions', () => {
    const schema = text.integer()

    expect(z.decode(schema, '42')).toBe(42)
    expect(z.encode(schema, 42)).toBe('42')
    expect(z.encode(schema, -0)).toBe('-0')
    expect(z.safeDecode(schema, '01').success).toBe(false)
    expect(z.safeDecode(schema, '1.2').success).toBe(false)
    expect(z.safeDecode(schema, String(Number.MAX_SAFE_INTEGER + 1)).success).toBe(false)
    expect(z.safeEncode(schema, Number.MAX_SAFE_INTEGER + 1).success).toBe(false)
    expectTypeOf<z.input<typeof schema>>().toEqualTypeOf<string>()
    expectTypeOf<z.output<typeof schema>>().toEqualTypeOf<number>()
  })

  test('converts finite JSON numbers and preserves negative zero', () => {
    const schema = text.number()

    expect(z.decode(schema, '-1.25e2')).toBe(-125)
    expect(Object.is(z.decode(schema, '-0'), -0)).toBe(true)
    expect(z.encode(schema, -0)).toBe('-0')
    expect(z.safeDecode(schema, '0x10').success).toBe(false)
    expect(z.safeDecode(schema, 'Infinity').success).toBe(false)
    expect(z.safeDecode(schema, '1_000').success).toBe(false)
    expect(z.safeEncode(schema, Number.POSITIVE_INFINITY).success).toBe(false)
  })

  test('converts arbitrary decimal bigints', () => {
    const schema = text.bigint()
    const value = 9_007_199_254_740_993n

    expect(z.decode(schema, '9007199254740993')).toBe(value)
    expect(z.encode(schema, value)).toBe('9007199254740993')
    expect(z.safeDecode(schema, '1e3').success).toBe(false)
    expectTypeOf<z.output<typeof schema>>().toEqualTypeOf<bigint>()
  })

  test('accepts only canonical boolean text', () => {
    const schema = text.boolean()

    expect(z.decode(schema, 'true')).toBe(true)
    expect(z.decode(schema, 'false')).toBe(false)
    expect(z.encode(schema, true)).toBe('true')
    expect(schema.safeParse('TRUE').success).toBe(false)
    expect(schema.safeParse('1').success).toBe(false)
  })

  test('converts offset-qualified datetimes to valid Dates', () => {
    const schema = text.datetime()

    expect(z.decode(schema, '2026-08-06T12:00:00+02:00')).toEqual(new Date('2026-08-06T10:00:00.000Z'))
    expect(z.encode(schema, new Date('2026-08-06T10:00:00.000Z'))).toBe('2026-08-06T10:00:00.000Z')
    expect(z.safeDecode(schema, '2026-08-06T12:00:00').success).toBe(false)
    expect(z.safeDecode(schema, 'not-a-date').success).toBe(false)
    expect(z.safeEncode(schema, new Date(Number.NaN)).success).toBe(false)
  })

  test('converts JSON text through a nested schema in both directions', () => {
    const schema = text.json(
      z.object({
        name: z.string(),
        createdAt: text.datetime(),
      })
    )
    const application = { name: 'Ada', createdAt: new Date('2026-08-06T10:00:00.000Z') }

    expect(z.decode(schema, '{"name":"Ada","createdAt":"2026-08-06T10:00:00.000Z"}')).toEqual(application)
    expect(z.encode(schema, application)).toBe('{"name":"Ada","createdAt":"2026-08-06T10:00:00.000Z"}')
    expect(z.safeDecode(schema, '{invalid').success).toBe(false)
    expect(z.safeDecode(schema, '{"name":1}').success).toBe(false)
    expectTypeOf<z.input<typeof schema>>().toEqualTypeOf<string>()
    expectTypeOf<z.output<typeof schema>>().toEqualTypeOf<{
      name: string
      createdAt: Date
    }>()
  })
})
