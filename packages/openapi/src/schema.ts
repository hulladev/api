import type { StandardJSONSchemaV1, StandardSchemaV1 } from '@standard-schema/spec'
import type { JSONSchema } from './types'

type StandardSchemaWithJSON = StandardSchemaV1 & StandardJSONSchemaV1

function hasJSONSchema(schema: StandardSchemaV1, direction: 'input' | 'output'): schema is StandardSchemaWithJSON {
  const standard = schema['~standard'] as StandardSchemaV1['~standard'] & {
    readonly jsonSchema?: unknown
  }
  const converter = standard.jsonSchema as { readonly input?: unknown; readonly output?: unknown } | undefined
  return converter !== undefined && typeof converter[direction] === 'function'
}

function normalizeJSONSchema(value: Record<string, unknown>): JSONSchema {
  const { $schema: _dialect, ...schema } = value
  return schema
}

/** Converts the declared HTTP representation to JSON Schema 2020-12. */
export function standardSchemaRepresentation(
  schema: StandardSchemaV1,
  location: string,
  fallback?: JSONSchema,
  direction: 'input' | 'output' = 'input'
): JSONSchema {
  if (!hasJSONSchema(schema, direction)) {
    if (fallback !== undefined) return fallback
    throw new Error(
      `${location} cannot be represented in OpenAPI because its Standard Schema does not implement Standard JSON Schema ${direction} conversion`
    )
  }

  try {
    return normalizeJSONSchema(schema['~standard'].jsonSchema[direction]({ target: 'draft-2020-12' }))
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error)
    throw new Error(`${location} JSON Schema conversion failed: ${message}`, { cause: error })
  }
}
