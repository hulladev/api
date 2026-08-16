import type { StandardSchemaV1 } from '@standard-schema/spec'
import * as z from 'zod/v4'
import { codec, type CodecSchema } from '../src/validation'

type ReversibleZodSchema<Schema extends z.core.$ZodType> = Schema & {
  readonly safeEncode: (value: z.output<Schema>) => z.ZodSafeParseResult<z.input<Schema>>
}

/** Test-only reversible schema fixture; production Zod adaptation lives in @hulla/api-zod. */
export function zodCodecFixture<const Schema extends z.core.$ZodType>(
  schema: Schema
): CodecSchema<z.input<Schema>, z.output<Schema>, Schema> {
  const reversible = schema as ReversibleZodSchema<Schema>
  const encode: StandardSchemaV1<z.output<Schema>, z.input<Schema>> = {
    '~standard': {
      version: 1,
      vendor: 'zod-test-fixture',
      validate: (value) => {
        const result = reversible.safeEncode(value as z.output<Schema>)
        return result.success ? { value: result.data } : { issues: result.error.issues }
      },
    },
  }
  return codec({ decode: schema, encode })
}
