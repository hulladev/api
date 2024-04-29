import { api } from '@/core/src'
import { encodeKey, queryKey } from '@/integrations/query/src/keys'
import { describe, expect, test } from 'bun:test'
import { expectTypeOf } from 'expect-type'

describe('main functionality', () => {
  test('encodeKey', () => {
    expect(encodeKey('GET', 'test', 'foo')).toStrictEqual('GET/test/foo')
  })
  test('queryKey', () => {
    const router = api.router(
      'test',
      api.procedure('foo', () => 'foo')
    )
    expect(queryKey(router)('call', 'foo')).toStrictEqual(['call/test/foo'])
  })
  test('queryKey with arg', () => {
    const router = api.router(
      'test',
      api.procedure('foo', (a: number) => a)
    )
    expect(queryKey(router)('call', 'foo', 2)).toStrictEqual(['call/test/foo', 2])
  })
})

describe('types', () => {
  test('encodeKey', () => {
    const key = encodeKey('GET', 'test', 'foo')
    expectTypeOf(key).toEqualTypeOf<'GET/test/foo'>()
  })
  test('queryKey', () => {
    const router = api.router(
      'test',
      api.procedure('foo', () => 'foo')
    )
    const key = queryKey(router)('call', 'foo')
    expectTypeOf(key).toEqualTypeOf<readonly ['call/test/foo']>()
  })
  test('queryKey with arg', () => {
    const router = api.router(
      'test',
      api.procedure('foo', (a: number) => a)
    )
    const key = queryKey(router)('call', 'foo', 2)
    expectTypeOf(key).toEqualTypeOf<readonly ['call/test/foo', 2]>()
  })
})
