import { describe, expect, test } from 'vitest'
import { z } from 'zod'
import { httpWire } from '../src'
import { zodWireSchemaConverter } from '../src/zod'

describe('zodWireSchemaConverter', () => {
  const converter = zodWireSchemaConverter()

  test('derives nested input-side wire descriptors', () => {
    expect(
      converter.convert(
        z.object({
          id: z.string(),
          count: z.number().default(1),
          tags: z.array(z.string()),
          at: z.date().nullable(),
          amount: z.bigint(),
          position: z.tuple([z.number(), z.string()]),
          status: z.enum(['open', 'done']),
        }),
        'input'
      )
    ).toMatchObject({
      kind: 'object',
      properties: {
        id: { kind: 'string' },
        count: { kind: 'optional', value: { kind: 'number' } },
        tags: { kind: 'array', items: { kind: 'string' } },
        at: { kind: 'nullable', value: { kind: 'date', encoding: 'iso' } },
        amount: { kind: 'bigint', encoding: 'decimal' },
        position: { kind: 'tuple', items: [{ kind: 'number' }, { kind: 'string' }] },
        status: { kind: 'enum', values: ['open', 'done'] },
      },
    })
  })

  test('uses httpWire for opaque nested schemas and rejects transforms', () => {
    const bytes = httpWire(z.instanceof(Uint8Array), { kind: 'bytes', encoding: 'base64' })
    expect(converter.convert(z.object({ bytes }), 'input')).toMatchObject({
      properties: { bytes: { kind: 'bytes', encoding: 'base64' } },
    })
    expect(() => converter.convert(z.string().transform(Number), 'input')).toThrow('httpWire')
    expect(() => converter.convert(z.coerce.number(), 'input')).toThrow('coercion')
    expect(() => converter.convert(z.union([z.string(), z.string().min(1)]), 'input')).toThrow('overlapping')
  })
})
