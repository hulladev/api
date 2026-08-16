import { codec as defineCodec, validation, type AsyncSchema, type CodecSchema } from '@hulla/api/validation'
import type { StandardSchemaV1 } from '@standard-schema/spec'
import * as z from 'zod/v4'

type ReversibleZodSchema<Schema extends z.core.$ZodType> = Schema & {
  readonly safeEncode: (value: z.output<Schema>) => z.ZodSafeParseResult<z.input<Schema>>
  readonly safeEncodeAsync: (value: z.output<Schema>) => Promise<z.ZodSafeParseResult<z.input<Schema>>>
}

function encodeResult<Wire>(result: z.ZodSafeParseResult<Wire>): StandardSchemaV1.Result<Wire> {
  return result.success ? { value: result.data } : { issues: result.error.issues }
}

function synchronous<const Schema extends z.core.$ZodType>(
  schema: Schema
): CodecSchema<z.input<Schema>, z.output<Schema>, Schema> {
  const reversible = schema as ReversibleZodSchema<Schema>
  const encode: StandardSchemaV1<z.output<Schema>, z.input<Schema>> = {
    '~standard': {
      version: 1,
      vendor: 'zod',
      validate: (value) => encodeResult(reversible.safeEncode(value as z.output<Schema>)),
    },
  }
  return defineCodec({ decode: schema, encode })
}

function asynchronous<const Schema extends z.core.$ZodType>(
  schema: Schema
): AsyncSchema<CodecSchema<z.input<Schema>, z.output<Schema>, Schema>> {
  const reversible = schema as ReversibleZodSchema<Schema>
  const encode: StandardSchemaV1<z.output<Schema>, z.input<Schema>> = {
    '~standard': {
      version: 1,
      vendor: 'zod',
      validate: async (value) => encodeResult(await reversible.safeEncodeAsync(value as z.output<Schema>)),
    },
  }
  return validation.async(defineCodec({ decode: schema, encode }))
}

/** Explicitly adapts a reversible Zod schema to an @hulla/api codec. */
export const codec = /* @__PURE__ */ Object.assign(synchronous, { async: asynchronous })
