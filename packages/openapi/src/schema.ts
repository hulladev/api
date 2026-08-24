import type { StandardJSONSchemaV1, StandardSchemaV1 } from '@standard-schema/spec'
import type { JSONSchema } from './types'

type StandardSchemaWithJSON = StandardSchemaV1 & StandardJSONSchemaV1

function hasJSONSchema(schema: StandardSchemaV1): schema is StandardSchemaWithJSON {
  const standard = schema['~standard'] as StandardSchemaV1['~standard'] & {
    readonly jsonSchema?: unknown
  }
  const converter = standard.jsonSchema as { readonly input?: unknown } | undefined
  return converter !== undefined && typeof converter.input === 'function'
}

function normalizeJSONSchema(value: Record<string, unknown>): JSONSchema {
  const { $schema: _dialect, ...schema } = value
  return schema
}

/** Converts the HTTP input representation of a Standard Schema to JSON Schema 2020-12. */
export function standardSchemaInput(schema: StandardSchemaV1, location: string, fallback?: JSONSchema): JSONSchema {
  if (!hasJSONSchema(schema)) {
    if (fallback !== undefined) return fallback
    throw new Error(
      `${location} cannot be represented in OpenAPI because its Standard Schema does not implement Standard JSON Schema input conversion`
    )
  }

  try {
    return normalizeJSONSchema(schema['~standard'].jsonSchema.input({ target: 'draft-2020-12' }))
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error)
    throw new Error(`${location} JSON Schema conversion failed: ${message}`, { cause: error })
  }
}
