import { describe, expect, test } from 'vitest'
import { cli } from '../src/args'

describe('CLI arguments', () => {
  test('parses the short output option', () => {
    const result = cli.parse(['openapi.json', '-o', 'api.generated.ts'])

    expect(result.arguments.input.value).toBe('openapi.json')
    expect(result.arguments.output.value).toBe('api.generated.ts')
    expect(result.arguments.names.value).toBeUndefined()
  })

  test('uses --names for operation naming mode', () => {
    const result = cli.parse(['openapi.json', '--output', 'api.generated.ts', '--names', 'path'])

    expect(result.arguments.names.value).toBe('path')
  })
})
