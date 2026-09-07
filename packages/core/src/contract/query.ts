import { annotateAPIErrorIssues, type APIError, type APIErrorIssue, type QueryTransportErrorCode } from '../errors'
import { type ExecutionStep, mapExecutionStep } from '../execution'
import { hasOwn, isPlainRecord, setOwn } from '../object'
import { compileSchemaExecution, type ObjectSchema, type SchemaOutbound, type SchemaOutput } from '../validation'

export type { QueryTransportErrorCode } from '../errors'

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

export type QueryEncoder<Query extends ObjectSchema> = (value: SchemaOutbound<Query>) => ExecutionStep<QueryWireObject>

type QueryWireValue = string | readonly string[] | undefined
export type QueryWireObject = Readonly<Record<string, QueryWireValue>>
export type QuerySource = URLSearchParams | Readonly<Record<string, unknown>>

export type QueryDecoder<Query extends ObjectSchema> = (parameters: QuerySource) => ExecutionStep<SchemaOutput<Query>>

function scalarText(value: unknown, key: string): string {
  if (typeof value === 'string') return value
  throw new QueryTransportError(
    'invalid-query-value',
    `Query field "${key}" must be a string, flat string array, or undefined`,
    key
  )
}

function encodedQuery(value: unknown): QueryWireObject {
  if (!isPlainRecord(value)) throw new QueryTransportError('invalid-query-value', 'Encoded query must be an object')

  const parameters: Record<string, string | readonly string[] | undefined> = {}
  for (const [key, field] of Object.entries(value)) {
    if (field === undefined) {
      setOwn(parameters, key, undefined)
      continue
    }
    if (!Array.isArray(field)) {
      setOwn(parameters, key, scalarText(field, key))
      continue
    }
    if (field.length === 0) {
      throw new QueryTransportError('empty-query-array', `Query field "${key}" cannot encode an empty array`, key)
    }
    setOwn(
      parameters,
      key,
      field.map((item) => scalarText(item, key))
    )
  }
  return parameters
}

function queryInput(parameters: QuerySource): Readonly<Record<string, unknown>> {
  if (!(parameters instanceof URLSearchParams)) {
    let normalized: Record<string, unknown> | undefined
    for (const [key, value] of Object.entries(parameters)) {
      if (value === undefined || (Array.isArray(value) && value.length <= 1)) {
        normalized ??= { ...parameters }
        if (value === undefined || (Array.isArray(value) && value.length === 0)) delete normalized[key]
        else setOwn(normalized, key, (value as unknown[])[0])
      }
    }
    return normalized ?? parameters
  }
  const input: Record<string, string | string[]> = {}
  for (const [key, value] of parameters) {
    const existing = input[key]
    if (existing === undefined && !hasOwn(input, key)) setOwn(input, key, value)
    else if (Array.isArray(existing)) existing.push(value)
    else setOwn(input, key, [existing as string, value])
  }
  return input
}

export function compileQueryEncoder<const Query extends ObjectSchema>(query: Query): QueryEncoder<Query> {
  const encode = compileSchemaExecution(query, { location: 'query' }).encode
  return encode === undefined
    ? (encodedQuery as QueryEncoder<Query>)
    : (value) => mapExecutionStep(encode(value), encodedQuery)
}

export function compileQueryDecoder<const Query extends ObjectSchema>(query: Query): QueryDecoder<Query> {
  const decode = compileSchemaExecution(query, { location: 'query' }).decode
  return (parameters) => decode(queryInput(parameters))
}
