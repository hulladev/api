import type { StandardSchemaV1 } from '@standard-schema/spec'

/** Exercises actual asynchronous Standard Schema validation without vendor-specific behavior. */
export function asynchronousSchema<Input, Output>(
  schema: StandardSchemaV1<Input, Output>
): StandardSchemaV1<Input, Output> {
  return { '~standard': { ...schema['~standard'], validate: async (value) => schema['~standard'].validate(value) } }
}
