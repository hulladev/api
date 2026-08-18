import type { StandardSchemaV1 } from '@standard-schema/spec'
import { describe, expect, expectTypeOf, test } from 'vitest'
import { annotateAPIErrorIssues, isAPIError, toAPIProblem, type APIError, type APIErrorIssue } from '../src/errors'
import { QueryTransportError } from '../src/query'
import { ContractError, ServerImplementationError } from '../src/server'
import { SchemaValidationError } from '../src/validation'

describe('structured API errors', () => {
  test('uses one Standard Schema-compatible issue convention across error domains', () => {
    const schema = new SchemaValidationError([{ message: 'Expected a string', path: ['profile', { key: 'name' }] }], {
      location: 'body',
    })
    const query = new QueryTransportError('invalid-query-value', 'Query field must be flat', 'search')
    const server = new ServerImplementationError('missing-handler', ['organizations.list'], 'Missing handler')

    for (const error of [schema, query, server]) {
      expect(isAPIError(error)).toBe(true)
      expect(error.code).toBeTypeOf('string')
      expect(error.issues.length).toBeGreaterThan(0)
      expect(error.issues[0]).toHaveProperty('message')
    }

    expect(schema).toMatchObject({
      code: 'schema-validation',
      location: 'body',
      issues: [{ code: 'schema-validation', location: 'body', message: 'Expected a string' }],
    })
    expect(query).toMatchObject({
      code: 'invalid-query-value',
      key: 'search',
      issues: [{ code: 'invalid-query-value', location: 'query', path: ['search'] }],
    })
    expect(server.issues).toMatchObject([{ code: 'missing-handler', handlerKey: 'organizations.list' }])

    expectTypeOf<StandardSchemaV1.Issue>().toExtend<APIErrorIssue>()
    expectTypeOf(schema).toExtend<APIError<'schema-validation'>>()
  })

  test('annotates issues without mutating validator-owned values', () => {
    const source = [{ message: 'Invalid value', path: ['value'] }] as const
    const annotated = annotateAPIErrorIssues(source, { code: 'custom.invalid', location: 'input' })

    expect(source[0]).toEqual({ message: 'Invalid value', path: ['value'] })
    expect(annotated).toEqual([
      { message: 'Invalid value', path: ['value'], code: 'custom.invalid', location: 'input' },
    ])
    expect(annotated[0]).not.toBe(source[0])

    const vendorCode = annotateAPIErrorIssues([{ message: 'Vendor issue', code: 42 }], {
      code: 'schema-validation',
    })
    expect(vendorCode).toEqual([{ message: 'Vendor issue', code: 42 }])
  })

  test('supports structural narrowing for application and plugin errors', () => {
    const custom = Object.assign(new Error('Plugin failed'), {
      code: 'plugin.failed',
      issues: Object.freeze([{ message: 'Connection unavailable' }]),
    })

    expect(isAPIError(custom)).toBe(true)
    expect(isAPIError(new Error('Unstructured failure'))).toBe(false)
    expect(isAPIError({ code: 'broken', issues: [] })).toBe(false)
  })

  test('serializes issues to one JSON-safe protocol problem shape', () => {
    const symbol = Symbol.for('secret')
    const error = new SchemaValidationError([{ message: 'Invalid profile', path: ['profile', { key: 0 }, symbol] }], {
      location: 'response',
    })

    expect(toAPIProblem(error, { status: 502, title: 'Invalid upstream response' })).toEqual({
      type: 'about:blank',
      title: 'Invalid upstream response',
      status: 502,
      code: 'schema-validation',
      issues: [
        {
          message: 'Invalid profile',
          path: ['profile', 0, 'Symbol(secret)'],
          code: 'schema-validation',
          location: 'response',
        },
      ],
    })
  })

  test('keeps ContractError as a location-specific schema error', () => {
    const cause = new SchemaValidationError([{ message: 'Expected an integer', path: ['limit'] }])
    const error = new ContractError('query', cause.issues, { cause })

    expect(error).toBeInstanceOf(SchemaValidationError)
    expect(error).toMatchObject({
      name: 'ContractError',
      code: 'schema-validation',
      location: 'query',
      cause,
      issues: [{ message: 'Expected an integer', location: 'query' }],
    })
  })
})
