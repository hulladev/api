import { annotateAPIErrorIssues, type APIError, type APIErrorIssue, type QueryTransportErrorCode } from './errors'
import { type ExecutionStep, mapExecutionStep } from './execution'
import { hasOwn, isPlainRecord, setOwn } from './object'
import { isRequestQueryDefinition, type AnyRequestQuery, type RequestQueryDefinition } from './request'
import {
  compileSchemaExecution,
  isSchema,
  type ObjectSchema,
  type SchemaOutbound,
  type SchemaOutput,
} from './validation'

export type { QueryTransportErrorCode } from './errors'

export type NormalizedRequestQuery<Schema extends ObjectSchema = ObjectSchema> = RequestQueryDefinition<Schema>

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
    this.issues = annotateAPIErrorIssues([{ message, ...(key === undefined ? {} : { key, path: [key] }) }], {
      code,
      location: 'query',
    }) as readonly QueryTransportIssue[]
    if (key !== undefined) this.key = key
  }
}

export function normalizeRequestQuery<const Schema extends ObjectSchema>(
  declaration: Schema | RequestQueryDefinition<Schema>
): NormalizedRequestQuery<Schema> {
  const schema = isRequestQueryDefinition(declaration) ? declaration.schema : declaration
  if (!isSchema(schema)) throw new TypeError('Request query must be declared with an object Standard Schema')
  return Object.freeze({ kind: 'request-query', schema })
}

export type QueryEncoder<Query extends AnyRequestQuery> = (
  value: SchemaOutbound<Query['schema']>
) => ExecutionStep<URLSearchParams>

export type QueryDecoder<Query extends AnyRequestQuery> = (
  parameters: URLSearchParams
) => ExecutionStep<SchemaOutput<Query['schema']>>

function scalarText(value: unknown, key: string): string {
  if (typeof value === 'string') return value
  throw new QueryTransportError(
    'invalid-query-value',
    `Query field "${key}" must be a string, flat string array, or undefined`,
    key
  )
}

function encodedQuery(value: unknown): URLSearchParams {
  if (!isPlainRecord(value)) throw new QueryTransportError('invalid-query-value', 'Encoded query must be an object')

  const parameters = new URLSearchParams()
  for (const [key, field] of Object.entries(value)) {
    if (field === undefined) continue
    if (!Array.isArray(field)) {
      parameters.append(key, scalarText(field, key))
      continue
    }
    if (field.length === 0) {
      throw new QueryTransportError('empty-query-array', `Query field "${key}" cannot encode an empty array`, key)
    }
    for (const item of field) parameters.append(key, scalarText(item, key))
  }
  return parameters
}

function queryInput(parameters: URLSearchParams): Readonly<Record<string, string | string[]>> {
  const input: Record<string, string | string[]> = {}
  for (const [key, value] of parameters) {
    const existing = input[key]
    if (existing === undefined && !hasOwn(input, key)) setOwn(input, key, value)
    else if (Array.isArray(existing)) existing.push(value)
    else setOwn(input, key, [existing as string, value])
  }
  return input
}

export function compileQueryEncoder<const Query extends AnyRequestQuery>(query: Query): QueryEncoder<Query> {
  const encode = compileSchemaExecution(query.schema, { location: 'query' }).encode
  return encode === undefined
    ? (encodedQuery as QueryEncoder<Query>)
    : (value) => mapExecutionStep(encode(value), encodedQuery)
}

export function compileQueryDecoder<const Query extends AnyRequestQuery>(query: Query): QueryDecoder<Query> {
  const decode = compileSchemaExecution(query.schema, { location: 'query' }).decode
  return (parameters) => decode(queryInput(parameters))
}

export async function encodeQuery<const Query extends AnyRequestQuery>(
  query: Query,
  value: SchemaOutbound<Query['schema']>
): Promise<URLSearchParams> {
  return compileQueryEncoder(query)(value)
}

export async function decodeQuery<const Query extends AnyRequestQuery>(
  query: Query,
  parameters: URLSearchParams
): Promise<SchemaOutput<Query['schema']>> {
  return compileQueryDecoder(query)(parameters)
}
