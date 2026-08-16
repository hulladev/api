import { annotateAPIErrorIssues, type APIError, type APIErrorIssue, type QueryTransportErrorCode } from './errors'
import { type ExecutionStep, mapExecutionStep } from './execution'
import { isRequestQueryDefinition, type AnyRequestQuery, type RequestQueryDefinition } from './request'
import { compileSchemaExecution, isSchema, type ObjectSchema, type SchemaOutput } from './validation'

export type { QueryTransportErrorCode } from './errors'

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

export type QueryTransportIssue = APIErrorIssue & {
  readonly location: 'query'
  readonly code: QueryTransportErrorCode
  readonly key?: string
}

export class QueryTransportError extends TypeError implements APIError<QueryTransportErrorCode, QueryTransportIssue> {
  readonly code: QueryTransportErrorCode
  readonly issues: readonly QueryTransportIssue[]
  readonly key?: string

  constructor(code: QueryTransportErrorCode, message: string, key?: string) {
    super(message)
    this.name = 'QueryTransportError'
    this.code = code
    this.issues = annotateAPIErrorIssues(
      [
        {
          message,
          ...(key === undefined ? {} : { key, path: [key] }),
        },
      ],
      { code, location: 'query' }
    ) as readonly QueryTransportIssue[]
    if (key !== undefined) this.key = key
  }
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

  const transport = explicitPlan([])
  const repeated = Object.freeze([])
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

export type QueryEncoder<Query extends AnyRequestQuery & { readonly transport: QueryTransportPlan }> = (
  value: SchemaOutput<Query['schema']>
) => ExecutionStep<URLSearchParams>

export type QueryDecoder<Query extends AnyRequestQuery & { readonly transport: QueryTransportPlan }> = (
  parameters: URLSearchParams
) => ExecutionStep<SchemaOutput<Query['schema']>>

function encodedQuery(query: AnyRequestQuery & { readonly transport: QueryTransportPlan }, encoded: unknown) {
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

function queryInput(query: AnyRequestQuery & { readonly transport: QueryTransportPlan }, parameters: URLSearchParams) {
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

  return input
}

export function compileQueryEncoder<const Query extends AnyRequestQuery & { readonly transport: QueryTransportPlan }>(
  query: Query
): QueryEncoder<Query> {
  const encode = compileSchemaExecution(query.schema, { location: 'query' }).encode
  return (value) => mapExecutionStep(encode(value), (encoded) => encodedQuery(query, encoded))
}

export function compileQueryDecoder<const Query extends AnyRequestQuery & { readonly transport: QueryTransportPlan }>(
  query: Query
): QueryDecoder<Query> {
  const decode = compileSchemaExecution(query.schema, { location: 'query' }).decode
  return (parameters) => decode(queryInput(query, parameters))
}

export async function encodeQuery<const Query extends AnyRequestQuery & { readonly transport: QueryTransportPlan }>(
  query: Query,
  value: SchemaOutput<Query['schema']>
): Promise<URLSearchParams> {
  return compileQueryEncoder(query)(value)
}

export async function decodeQuery<const Query extends AnyRequestQuery & { readonly transport: QueryTransportPlan }>(
  query: Query,
  parameters: URLSearchParams
): Promise<SchemaOutput<Query['schema']>> {
  return compileQueryDecoder(query)(parameters)
}
