import type { StandardSchemaV1 } from '@standard-schema/spec'

export type APIErrorLocation = 'body' | 'headers' | 'input' | 'output' | 'params' | 'query' | 'response'

/**
 * The shared issue shape for every structured @hulla/api error. It is directly
 * compatible with Standard Schema issues and adds optional boundary metadata.
 */
export type APIErrorIssue = StandardSchemaV1.Issue & {
  /** Vendor-defined when supplied by Standard Schema; @hulla/api-created issues use strings. */
  readonly code?: unknown
  readonly location?: APIErrorLocation
}

export type ClientResponseErrorCode = 'content-type-mismatch' | 'missing-body' | 'unexpected-status'

export type QueryTransportErrorCode =
  | 'duplicate-query-value'
  | 'empty-query-array'
  | 'invalid-query-value'
  | 'mixed-query-cardinality'
  | 'unsupported-query-schema'

export type SchemaValidationErrorCode = 'schema-validation'

export type ServerImplementationErrorCode =
  | 'duplicate-handler'
  | 'invalid-fragment'
  | 'invalid-handler'
  | 'missing-handler'
  | 'unknown-handler'

export type ServerRuntimeErrorCode =
  | 'invalid-context'
  | 'invalid-path-encoding'
  | 'invalid-request-body'
  | 'invalid-server-response'
  | 'unsupported-media-type'

export type APIErrorCode =
  | ClientResponseErrorCode
  | QueryTransportErrorCode
  | SchemaValidationErrorCode
  | ServerImplementationErrorCode
  | ServerRuntimeErrorCode

/** A common discriminated shape implemented by all structured @hulla/api errors. */
export type APIError<Code extends string = string, Issue extends APIErrorIssue = APIErrorIssue> = Error & {
  readonly code: Code
  readonly issues: readonly Issue[]
}

export type APIErrorIssueAnnotations = {
  readonly code?: string
  readonly location?: APIErrorLocation
}

/** Copies and freezes issues while adding boundary metadata that is not already present. */
export function annotateAPIErrorIssues(
  issues: readonly APIErrorIssue[],
  annotations: APIErrorIssueAnnotations = {}
): readonly APIErrorIssue[] {
  return Object.freeze(
    issues.map((issue) =>
      Object.freeze({
        ...issue,
        ...(issue.code === undefined && annotations.code !== undefined ? { code: annotations.code } : {}),
        ...(issue.location === undefined && annotations.location !== undefined
          ? { location: annotations.location }
          : {}),
      })
    )
  )
}

/** Structurally narrows unknown failures without relying on package-local instanceof identity. */
export function isAPIError(value: unknown): value is APIError {
  if (typeof value !== 'object' || value === null) return false

  const candidate = value as Partial<APIError>
  return (
    typeof candidate.name === 'string' &&
    typeof candidate.message === 'string' &&
    typeof candidate.code === 'string' &&
    Array.isArray(candidate.issues) &&
    candidate.issues.every((issue) => typeof issue === 'object' && issue !== null && typeof issue.message === 'string')
  )
}

export type APIProblemIssue = {
  readonly message: string
  readonly path?: readonly (string | number)[]
  readonly code?: string
  readonly location?: APIErrorLocation
}

export type APIProblem = {
  readonly type: string
  readonly title: string
  readonly status: number
  readonly code: string
  readonly issues?: readonly APIProblemIssue[]
}

export type APIProblemOptions = {
  readonly status: number
  readonly title?: string
  readonly type?: string
}

function pathKey(segment: PropertyKey | StandardSchemaV1.PathSegment): string | number {
  const key = typeof segment === 'object' ? segment.key : segment
  return typeof key === 'symbol' ? String(key) : key
}

/** Converts any structured @hulla/api error into its JSON-safe protocol representation. */
export function toAPIProblem(error: APIError, options: APIProblemOptions): APIProblem {
  const issues = error.issues.map((issue): APIProblemIssue => {
    const path = issue.path?.map(pathKey)
    return Object.freeze({
      message: issue.message,
      ...(path === undefined ? {} : { path: Object.freeze(path) }),
      ...(typeof issue.code === 'string' ? { code: issue.code } : {}),
      ...(issue.location === undefined ? {} : { location: issue.location }),
    })
  })

  return Object.freeze({
    type: options.type ?? 'about:blank',
    title: options.title ?? error.message,
    status: options.status,
    code: error.code,
    ...(issues.length === 0 ? {} : { issues: Object.freeze(issues) }),
  })
}
