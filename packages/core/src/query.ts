import { isRequestQueryDefinition, type AnyRequestQuery, type RequestQueryDefinition } from './request'
import { decodeSchema, encodeSchema, isSchema, type ObjectSchema, type SchemaOutput } from './validation'

export type QueryCardinality = 'repeated' | 'single'

export type QueryTransportPlan = {
  readonly fields: Readonly<Record<string, QueryCardinality>>
}

export type NormalizedRequestQuery<Schema extends ObjectSchema = ObjectSchema> = RequestQueryDefinition<
  Schema,
  readonly string[]
> & {
  readonly transport: QueryTransportPlan
}

export type QueryTransportErrorCode =
  | 'duplicate-query-value'
  | 'empty-query-array'
  | 'invalid-query-value'
  | 'mixed-query-cardinality'
  | 'unsupported-query-schema'

export class QueryTransportError extends TypeError {
  readonly code: QueryTransportErrorCode
  readonly key?: string

  constructor(code: QueryTransportErrorCode, message: string, key?: string) {
    super(message)
    this.name = 'QueryTransportError'
    this.code = code
    if (key !== undefined) this.key = key
  }
}

type ZodDefinition = Readonly<Record<string, unknown>> & { readonly type: string }
type ZodSchema = {
  readonly _zod: {
    readonly def: ZodDefinition
  }
}

const zodPlans = new WeakMap<object, QueryTransportPlan>()

function isObject(value: unknown): value is Record<PropertyKey, unknown> {
  return typeof value === 'object' && value !== null
}

function isZodSchema(value: unknown): value is ZodSchema {
  if (!isObject(value)) return false
  const zod = value['_zod']
  return isObject(zod) && isObject(zod['def']) && typeof zod['def']['type'] === 'string'
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

function zodCardinality(schema: ZodSchema, field: string, seen = new Set<object>()): QueryCardinality {
  const input = inputSchema(schema, seen)
  const definition = input._zod.def

  if (definition.type === 'array' || definition.type === 'tuple') return 'repeated'

  if (definition.type === 'union') {
    const options = definition['options']
    if (!Array.isArray(options) || options.length === 0 || !options.every(isZodSchema)) return 'single'

    const cardinalities = new Set(options.map((option) => zodCardinality(option, field, new Set(seen))))
    if (cardinalities.size === 1) return cardinalities.values().next().value ?? 'single'

    throw new QueryTransportError(
      'mixed-query-cardinality',
      `Query field "${field}" mixes scalar and repeated Zod inputs`,
      field
    )
  }

  return 'single'
}

function zodObjectShape(schema: ZodSchema): Readonly<Record<string, ZodSchema>> {
  const input = inputSchema(schema, new Set())
  const definition = input._zod.def

  if (definition.type !== 'object' || !isObject(definition['shape'])) {
    throw new QueryTransportError('unsupported-query-schema', 'Zod query schemas must have an object input shape')
  }

  const shape: Record<string, ZodSchema> = {}
  for (const [key, value] of Object.entries(definition['shape'])) {
    if (!isZodSchema(value)) {
      throw new QueryTransportError(
        'unsupported-query-schema',
        `Zod query field "${key}" does not expose a supported input schema`,
        key
      )
    }
    shape[key] = value
  }
  return shape
}

function inferZodPlan(schema: ZodSchema): QueryTransportPlan {
  const cached = zodPlans.get(schema)
  if (cached) return cached

  const fields: Record<string, QueryCardinality> = {}
  for (const [key, fieldSchema] of Object.entries(zodObjectShape(schema))) {
    fields[key] = zodCardinality(fieldSchema, key)
  }

  const plan = Object.freeze({ fields: Object.freeze(fields) })
  zodPlans.set(schema, plan)
  return plan
}

function explicitPlan(repeated: readonly string[]): QueryTransportPlan {
  const fields: Record<string, QueryCardinality> = {}
  for (const key of repeated) fields[key] = 'repeated'
  return Object.freeze({ fields: Object.freeze(fields) })
}

export function normalizeRequestQuery<const Schema extends ObjectSchema>(
  declaration: Schema | RequestQueryDefinition<Schema, readonly string[]>
): NormalizedRequestQuery<Schema> {
  if (isRequestQueryDefinition(declaration)) {
    return Object.freeze({
      ...declaration,
      transport: explicitPlan(declaration.repeated),
    }) as NormalizedRequestQuery<Schema>
  }

  if (!isSchema(declaration)) throw new TypeError('Request query must be declared with an object Standard Schema')

  const transport = isZodSchema(declaration) ? inferZodPlan(declaration) : explicitPlan([])
  const repeated = Object.freeze(
    Object.entries(transport.fields)
      .filter(([, cardinality]) => cardinality === 'repeated')
      .map(([key]) => key)
  )
  return Object.freeze({
    kind: 'request-query',
    schema: declaration,
    repeated,
    transport,
  }) as NormalizedRequestQuery<Schema>
}

function recordValue(value: unknown): value is Readonly<Record<string, unknown>> {
  return typeof value === 'object' && value !== null && !Array.isArray(value)
}

export async function encodeQuery<const Query extends AnyRequestQuery & { readonly transport: QueryTransportPlan }>(
  query: Query,
  value: SchemaOutput<Query['schema']>
): Promise<URLSearchParams> {
  const encoded = await encodeSchema(query.schema, value)
  if (!recordValue(encoded)) {
    throw new QueryTransportError('invalid-query-value', 'Encoded query must be an object')
  }

  const parameters = new URLSearchParams()

  for (const [key, fieldValue] of Object.entries(encoded)) {
    if (fieldValue === undefined) continue

    const cardinality = query.transport.fields[key] ?? 'single'
    if (cardinality === 'repeated') {
      if (!Array.isArray(fieldValue) || !fieldValue.every((item) => typeof item === 'string')) {
        throw new QueryTransportError(
          'invalid-query-value',
          `Repeated query field "${key}" must encode to an array or tuple of strings`,
          key
        )
      }
      if (fieldValue.length === 0) {
        throw new QueryTransportError('empty-query-array', `Query field "${key}" cannot encode an empty array`, key)
      }
      for (const item of fieldValue) parameters.append(key, item)
      continue
    }

    if (typeof fieldValue !== 'string') {
      const suffix = Array.isArray(fieldValue)
        ? '; non-Zod repeated fields require request.query(schema, { repeated: [...] })'
        : ''
      throw new QueryTransportError('invalid-query-value', `Query field "${key}" must encode to a string${suffix}`, key)
    }
    parameters.set(key, fieldValue)
  }

  return parameters
}

export async function decodeQuery<const Query extends AnyRequestQuery & { readonly transport: QueryTransportPlan }>(
  query: Query,
  parameters: URLSearchParams
): Promise<SchemaOutput<Query['schema']>> {
  const input: Record<string, string | readonly string[]> = {}
  const keys = new Set(parameters.keys())

  for (const key of keys) {
    const values = parameters.getAll(key)
    const cardinality = query.transport.fields[key] ?? 'single'

    if (cardinality === 'repeated') {
      input[key] = values
      continue
    }

    if (values.length > 1) {
      throw new QueryTransportError(
        'duplicate-query-value',
        `Query field "${key}" must not be provided more than once`,
        key
      )
    }

    const value = values[0]
    if (value !== undefined) input[key] = value
  }

  return decodeSchema(query.schema, input)
}
