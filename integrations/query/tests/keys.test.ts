import { describe, expect, test } from 'bun:test'
import { expectTypeOf } from 'expect-type'
import { api } from '../../../core/src/api'
import { encodeKey, queryKey } from '../src/keys'

describe('main functionality', () => {
  test('encodeKey', () => {
    expect(encodeKey('GET', 'test', 'foo')).toStrictEqual('GET/test/foo')
  })
  test('queryKey', () => {
    const router = api.router({ name: 'test', routes: [api.procedure('foo', () => 'foo')] })
    const a = api.create(router, { queryKey })
    expect(a.queryKey.call('foo')).toStrictEqual(['call/test/foo'])
  })
  test('queryKey with arg', () => {
    const router = api.router({ name: 'aa', routes: [api.procedure('foo', () => 'foo')] })
    const a = api.create(router, { queryKey })
    expect(a.queryKey.call('foo', 2)).toStrictEqual(['call/aa/foo', 2])
  })
  test('queryKey allows variable arg length', () => {
    const router = api.router({ name: 'test', routes: [api.procedure('foo', (a: number, b: string) => a + b)] })
    const a = api.create(router, { queryKey })
    a.queryKey.post
    expect(a.queryKey.call('foo')).toStrictEqual(['call/test/foo'])
    expect(a.queryKey.call('foo', 2)).toStrictEqual(['call/test/foo', 2])
    expect(a.queryKey.call('foo', 2, 'bar')).toStrictEqual(['call/test/foo', 2, 'bar'])
    expect(a.queryKey.call('foo', 2, 'bar', 3)).toStrictEqual(['call/test/foo', 2, 'bar', 3])
  })
})

describe('types', () => {
  test('encodeKey', () => {
    const key = encodeKey('GET', 'test', 'foo')
    expectTypeOf(key).toEqualTypeOf<'GET/test/foo'>()
  })
  test('queryKey', () => {
    const router = api.router({ name: 'test', routes: [api.procedure('foo', () => 'foo')] })
    const key = queryKey(router).call('foo')
    expectTypeOf(key).toEqualTypeOf<readonly ['call/test/foo']>()
  })
  test('queryKey with arg', () => {
    const router = api.router({ name: 'test', routes: [api.procedure('foo', (a: number) => a)] })
    const key = queryKey(router).call('foo', 2)
    expectTypeOf(key).toEqualTypeOf<readonly ['call/test/foo', 2]>()
  })
  test('resulting queryKey correctly resolves EXACT type even with variadic tuple length', () => {
    const router = api.router({ name: 'test', routes: [api.procedure('foo', (a: number, b: string) => a + b)] })
    const key = queryKey(router).call('foo', 2, 'bar')
    const key2 = queryKey(router).call('foo')
    expectTypeOf(key).toEqualTypeOf<readonly ['call/test/foo', 2, 'bar']>()
    expectTypeOf(key2).toEqualTypeOf<readonly ['call/test/foo']>()
    expectTypeOf(key).not.toEqualTypeOf<readonly ['call/test/foo']>()
    expectTypeOf(key2).not.toEqualTypeOf<readonly ['call/test/foo', 2, 'bar']>()
  })
})
