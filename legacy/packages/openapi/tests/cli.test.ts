import { describe, expect, test } from 'vitest'
import { parseArguments } from '../src/args'

describe('CLI arguments', () => {
  test('parses the short output option', () => {
    const result = parseArguments(['openapi.json', '-o', 'api.generated.ts'])

    expect(result).toEqual({ input: 'openapi.json', output: 'api.generated.ts', operationNames: undefined })
  })

  test('uses --names for operation naming mode', () => {
    const result = parseArguments(['openapi.json', '--output=api.generated.ts', '--names', 'path'])

    expect(result.operationNames).toBe('path')
  })

  test('rejects unknown options and invalid values', () => {
    expect(() => parseArguments(['openapi.json', '--unknown'])).toThrow('Unknown option')
    expect(() => parseArguments(['openapi.json', '--names', 'legacy'])).toThrow('operationId')
  })
})
