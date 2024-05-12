import { api } from '@hulla/api'
import { expectTypeOf } from 'expect-type'
import { describe, expect, test } from 'vitest'
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
    const router = api.router({ name: 'aa', routes: [api.procedure('foo', (b: number) => b)] })
    const a = api.create(router, { queryKey })
    expect(a.queryKey.call('foo', 2)).toStrictEqual(['call/aa/foo', 2])
  })
  test('queryKey allows variable arg length', () => {
    const router = api.router({ name: 'test', routes: [api.procedure('foo', (a: number, b: string) => a + b)] })
    const a = api.create(router, { queryKey })
    expect(a.queryKey.call('foo')).toStrictEqual(['call/test/foo'])
    expect(a.queryKey.call('foo', 2)).toStrictEqual(['call/test/foo', 2])
    expect(a.queryKey.call('foo', 2, 'bar')).toStrictEqual(['call/test/foo', 2, 'bar'])
    // @ts-expect-error passing too many arguments on purpose
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
    expectTypeOf(key).not.toEqualTypeOf<readonly ['call/test/foo']>()
    expectTypeOf(key2).not.toEqualTypeOf<readonly ['call/test/foo', 2, 'bar']>()
  })
  test.todo('when no arg is provided, it correctly defaults to [encodeKey]', () => {
    const router = api.router({ name: 'test', routes: [api.procedure('foo', (a: number, b: string) => a + b)] })
    const key2 = queryKey(router).call('foo')
    // @ts-expect-error right now the generic just defaults to all variants if it can't narrow
    // this is sort of ok from user perspective, but it still sucks i can't figure out a way to properly narrow this
    // because if i try to do A extends infer T | infer U ? [] : A then it eliminates argument varaints
    // so out of the two options, this seems like the better one for now - have arguments of variadic length work
    // and if it is provided without any arguments, then just "shut up"
    expectTypeOf(key2).toEqualTypeOf<readonly ['call/test/foo']>()
  })
})
