import { expect, test } from 'vitest'
import { compileQueryDecoder, compileQueryEncoder } from '../src/contract/query'

const schema = {
  '~standard': {
    version: 1 as const,
    vendor: 'query-materialization',
    validate: (value: unknown) => ({ value: value as Record<string, unknown> }),
  },
}

test('decodes repeated query fields without inheriting Object.prototype values', () => {
  const decode = compileQueryDecoder(schema)
  const result = decode(
    new URLSearchParams('__proto__=first&constructor=ctor&toString=text&__proto__=last&empty=')
  ) as Record<string, unknown>
  expect(Object.getPrototypeOf(result)).toBe(Object.prototype)
  expect(Object.hasOwn(result, '__proto__')).toBe(true)
  expect(result).toEqual({ ['__proto__']: ['first', 'last'], constructor: 'ctor', toString: 'text', empty: '' })
  expect(decode(new URLSearchParams())).toEqual({})
})

test('snapshots encoded query arrays and preserves undefined and prototype-named keys', () => {
  const encode = compileQueryEncoder(schema)
  const source = { ['__proto__']: ['a', 'b'], missing: undefined, scalar: 'value' }
  const result = encode(source) as Record<string, unknown>
  expect(Object.getPrototypeOf(result)).toBe(Object.prototype)
  expect(Object.hasOwn(result, 'missing')).toBe(true)
  expect(Object.hasOwn(result, '__proto__')).toBe(true)
  expect(result).toEqual(source)
  source['__proto__'].push('changed')
  expect(result['__proto__']).toEqual(['a', 'b'])
  for (const value of [[], ['a', 1], {}, null, 42]) {
    expect(() => encode({ field: value })).toThrow(/Query field/)
  }
})
