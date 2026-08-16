import { QueryTransportError, request, type RequestQueryDefinition } from '@hulla/api'
import type { CodecSchema } from '@hulla/api/validation'
import * as z from 'zod/v4'
import { codec } from './codec'

type QueryCardinality = 'repeated' | 'single'
type ZodDefinition = Readonly<Record<string, unknown>> & { readonly type: string }
type ZodSchema = {
  readonly _zod: {
    readonly def: ZodDefinition
  }
}

function isObject(value: unknown): value is Record<PropertyKey, unknown> {
  return typeof value === 'object' && value !== null
}

function isZodSchema(value: unknown): value is ZodSchema {
  if (!isObject(value)) return false
  const zodValue = value['_zod']
  return isObject(zodValue) && isObject(zodValue['def']) && typeof zodValue['def']['type'] === 'string'
}

function childSchema(definition: ZodDefinition, key: string): ZodSchema | undefined {
  const value = definition[key]
  return isZodSchema(value) ? value : undefined
}

function inputSchema(schema: ZodSchema, seen: Set<object>): ZodSchema {
  if (seen.has(schema)) return schema
  seen.add(schema)
  const definition = schema._zod.def

  if (definition.type === 'pipe') {
    const input = childSchema(definition, 'in')
    return input ? inputSchema(input, seen) : schema
  }
  if (
    definition.type === 'optional' ||
    definition.type === 'exact_optional' ||
    definition.type === 'default' ||
    definition.type === 'prefault' ||
    definition.type === 'nullable' ||
    definition.type === 'readonly' ||
    definition.type === 'catch' ||
    definition.type === 'nonoptional' ||
    definition.type === 'success'
  ) {
    const inner = childSchema(definition, 'innerType')
    return inner ? inputSchema(inner, seen) : schema
  }
  if (definition.type === 'lazy' && typeof definition['getter'] === 'function') {
    const lazy = definition['getter']()
    return isZodSchema(lazy) ? inputSchema(lazy, seen) : schema
  }
  return schema
}

function cardinality(schema: ZodSchema, field: string, seen = new Set<object>()): QueryCardinality {
  const definition = inputSchema(schema, seen)._zod.def
  if (definition.type === 'array' || definition.type === 'tuple') return 'repeated'

  if (definition.type === 'union') {
    const options = definition['options']
    if (!Array.isArray(options) || options.length === 0 || !options.every(isZodSchema)) return 'single'
    const cardinalities = new Set(options.map((option) => cardinality(option, field, new Set(seen))))
    if (cardinalities.size === 1) return cardinalities.values().next().value ?? 'single'
    throw new QueryTransportError(
      'mixed-query-cardinality',
      `Query field "${field}" mixes scalar and repeated Zod inputs`,
      field
    )
  }
  return 'single'
}

function repeatedFields(schema: z.ZodObject): readonly string[] {
  const definition = inputSchema(schema as unknown as ZodSchema, new Set())._zod.def
  if (definition.type !== 'object' || !isObject(definition['shape'])) {
    throw new TypeError('Zod query schemas must have an object input shape')
  }

  const repeated: string[] = []
  for (const [field, fieldSchema] of Object.entries(definition['shape'])) {
    if (!isZodSchema(fieldSchema)) throw new TypeError(`Zod query field "${field}" is not supported`)
    if (cardinality(fieldSchema, field) === 'repeated') repeated.push(field)
  }
  return repeated
}

/** Declares a Zod query schema and infers which fields use repeated URL parameters. */
export function query<const Schema extends z.ZodObject>(
  schema: Schema
): RequestQueryDefinition<CodecSchema<z.input<Schema>, z.output<Schema>, Schema>, readonly string[]> {
  const adapted = codec(schema)
  return request.query(adapted, { repeated: repeatedFields(schema) } as never) as unknown as RequestQueryDefinition<
    CodecSchema<z.input<Schema>, z.output<Schema>, Schema>,
    readonly string[]
  >
}
