import {
  annotateAPIErrorIssues,
  type APIError,
  type APIErrorIssue,
  type APIErrorLocation,
  type ServerImplementationErrorCode,
  type ServerRuntimeErrorCode,
} from '../errors'
import { SchemaValidationError, type SchemaIssue } from '../validation'

export type { APIProblem, APIProblemIssue, ServerImplementationErrorCode, ServerRuntimeErrorCode } from '../errors'
export type ContractLocation = Extract<APIErrorLocation, 'body' | 'headers' | 'params' | 'query' | 'response'>

/** A location-annotated schema failure at an HTTP contract boundary. */
export class ContractError extends SchemaValidationError {
  declare readonly location: ContractLocation

  constructor(location: ContractLocation, issues: readonly SchemaIssue[], options?: ErrorOptions) {
    super(issues, { ...options, location })
    this.name = 'ContractError'
    this.location = location
  }
}

export type ServerImplementationIssue = APIErrorIssue & {
  readonly code: ServerImplementationErrorCode
  readonly handlerKey?: string
}

export class ServerImplementationError
  extends TypeError
  implements APIError<ServerImplementationErrorCode, ServerImplementationIssue>
{
  readonly code: ServerImplementationErrorCode
  readonly handlerKeys: readonly string[]
  readonly issues: readonly ServerImplementationIssue[]

  constructor(code: ServerImplementationErrorCode, handlerKeys: readonly string[], message: string) {
    super(message)
    this.name = 'ServerImplementationError'
    this.code = code
    this.handlerKeys = Object.freeze([...handlerKeys])
    this.issues = annotateAPIErrorIssues(
      handlerKeys.length === 0
        ? [{ message }]
        : handlerKeys.map((handlerKey) => ({ message, handlerKey, path: [handlerKey] })),
      { code }
    ) as readonly ServerImplementationIssue[]
  }
}

export type ServerRuntimeIssue = APIErrorIssue & {
  readonly code: ServerRuntimeErrorCode
}

/** A structured failure raised while executing the Fetch server runtime. */
export class ServerRuntimeError extends TypeError implements APIError<ServerRuntimeErrorCode, ServerRuntimeIssue> {
  readonly code: ServerRuntimeErrorCode
  readonly issues: readonly ServerRuntimeIssue[]
  readonly status: number

  constructor(
    code: ServerRuntimeErrorCode,
    status: number,
    message: string,
    options: ErrorOptions & { readonly location?: APIErrorLocation } = {}
  ) {
    super(message, options)
    this.name = 'ServerRuntimeError'
    this.code = code
    this.status = status
    this.issues = annotateAPIErrorIssues([{ message }], {
      code,
      ...(options.location === undefined ? {} : { location: options.location }),
    }) as readonly ServerRuntimeIssue[]
  }
}
