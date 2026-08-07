import type { SchemaIssue } from '../validation'

export type ServerImplementationErrorCode =
  | 'duplicate-handler'
  | 'invalid-fragment'
  | 'invalid-handler'
  | 'missing-handler'
  | 'unknown-handler'

export type ContractLocation = 'body' | 'headers' | 'params' | 'query' | 'response'

export type ApiProblemIssue = {
  readonly location: ContractLocation
  readonly message: string
  readonly path: readonly (string | number)[]
}

export type ApiProblem = {
  readonly type: string
  readonly title: string
  readonly status: number
  readonly code: string
  readonly issues?: readonly ApiProblemIssue[]
}

export class ContractError extends Error {
  readonly location: ContractLocation
  readonly issues: readonly SchemaIssue[]

  constructor(location: ContractLocation, issues: readonly SchemaIssue[], options?: ErrorOptions) {
    super(`Contract validation failed for ${location}`, options)
    this.name = 'ContractError'
    this.location = location
    this.issues = issues
  }
}

export class ServerImplementationError extends TypeError {
  readonly code: ServerImplementationErrorCode
  readonly handlerKeys: readonly string[]

  constructor(code: ServerImplementationErrorCode, handlerKeys: readonly string[], message: string) {
    super(message)
    this.name = 'ServerImplementationError'
    this.code = code
    this.handlerKeys = Object.freeze([...handlerKeys])
  }
}
