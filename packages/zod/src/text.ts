import type { JsonValue } from '@hulla/api'
import * as z from 'zod/v4'
import { codec } from './codec'

const INTEGER_PATTERN = /^-?(?:0|[1-9]\d*)$/
const NUMBER_PATTERN = /^-?(?:0|[1-9]\d*)(?:\.\d+)?(?:[eE][+-]?\d+)?$/

function encodeNumber(value: number): string {
  return Object.is(value, -0) ? '-0' : String(value)
}

function integer() {
  return codec(
    z.codec(
      z.string().regex(INTEGER_PATTERN, 'Expected a base-10 integer string'),
      z.number().int().refine(Number.isSafeInteger, 'Expected a safe integer'),
      { decode: Number, encode: encodeNumber }
    )
  )
}

function number() {
  return codec(
    z.codec(
      z.string().regex(NUMBER_PATTERN, 'Expected a finite JSON-number string'),
      z.number().refine(Number.isFinite, 'Expected a finite number'),
      { decode: Number, encode: encodeNumber }
    )
  )
}

function bigint() {
  return codec(
    z.codec(z.string().regex(INTEGER_PATTERN, 'Expected a base-10 integer string'), z.bigint(), {
      decode: BigInt,
      encode: (value) => value.toString(),
    })
  )
}

function boolean() {
  return codec(
    z.codec(z.enum(['true', 'false']), z.boolean(), {
      decode: (value) => value === 'true',
      encode: (value) => (value ? 'true' : 'false'),
    })
  )
}

function datetime() {
  return codec(
    z.codec(
      z.iso.datetime({ offset: true }),
      z.date().refine((value) => !Number.isNaN(value.getTime())),
      {
        decode: (value) => new Date(value),
        encode: (value) => value.toISOString(),
      }
    )
  )
}

type JsonInputSchema<Schema extends z.core.$ZodType> = z.input<Schema> extends JsonValue ? Schema : never

function json<const Schema extends z.core.$ZodType>(schema: Schema & JsonInputSchema<Schema>) {
  return codec(
    z.codec(z.string(), schema, {
      decode: (value, context) => {
        try {
          return JSON.parse(value) as z.input<Schema>
        } catch (error) {
          context.issues.push({
            code: 'custom',
            input: value,
            message: error instanceof Error ? error.message : 'Expected valid JSON text',
          })
          return z.NEVER
        }
      },
      encode: (value, context) => {
        try {
          const encoded = JSON.stringify(value)
          if (encoded !== undefined) return encoded
        } catch (error) {
          context.issues.push({
            code: 'custom',
            input: value,
            message: error instanceof Error ? error.message : 'Expected a JSON-compatible value',
          })
          return z.NEVER
        }
        context.issues.push({ code: 'custom', input: value, message: 'Expected a JSON-compatible value' })
        return z.NEVER
      },
    })
  )
}

export const text = /* @__PURE__ */ Object.freeze({ integer, number, bigint, boolean, datetime, json })
