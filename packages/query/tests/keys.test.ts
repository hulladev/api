import { api } from '@hulla/api'
import { describe, expect, expectTypeOf, test } from 'vitest'
import { encodeKey, queryKey } from '../src/keys'

const a = api()

describe('main functionality', () => {
  test('encodeKey', () => {
    expect(encodeKey('GET', 'test', 'foo')).toStrictEqual('GET/test/foo')
  })
  test('queryKey', () => {
    const x = a.router({ name: 'test', routes: [a.procedure('foo').define(() => 'foo')], adapters: { queryKey } })
    expect(x.queryKey.call('foo')).toStrictEqual(['call/test/foo'])
  })
  test('queryKey with arg', () => {
    const router = a.router({
      name: 'aa',
      routes: [
        a
          .procedure('foo')
          .input((num: number) => num)
          .define(({ input }) => input),
      ],
      adapters: { queryKey },
    })
    expect(router.queryKey.call('foo', 2)).toStrictEqual(['call/aa/foo', 2])
  })
  test('queryKey allows variable arg length', () => {
    const x = a.router({
      name: 'test',
      routes: [
        a
          .procedure('foo')
          .input((a: number, b: string) => a + b)
          .define((opts) => opts.input),
      ],
      adapters: { queryKey },
    })
    expect(x.queryKey.call('foo')).toStrictEqual(['call/test/foo'])
    expect(x.queryKey.call('foo', 2)).toStrictEqual(['call/test/foo', 2])
    expect(x.queryKey.call('foo', 2, 'bar')).toStrictEqual(['call/test/foo', 2, 'bar'])
    // @ts-expect-error passing too many arguments on purpose
    expect(x.queryKey.call('foo', 2, 'bar', 3)).toStrictEqual(['call/test/foo', 2, 'bar', 3])
  })
})

describe('types', () => {
  test('encodeKey', () => {
    const key = encodeKey('GET', 'test', 'foo')
    expectTypeOf(key).toEqualTypeOf<'GET/test/foo'>()
  })
  test('queryKey', () => {
    const router = a.router({ name: 'test', routes: [a.procedure('foo').define(() => 'foo')], adapters: { queryKey } })
    const key = router.queryKey.call('foo')
    expectTypeOf(key).toEqualTypeOf<readonly ['call/test/foo']>()
  })
  test('queryKey with arg', () => {
    const router = a.router({
      name: 'test',
      routes: [
        a
          .procedure('foo')
          .input((a: number) => a)
          .define(({ input }) => input),
      ],
      adapters: { queryKey },
    })
    const key = router.queryKey.call('foo', 2)
    expectTypeOf(key).toEqualTypeOf<readonly ['call/test/foo', 2]>()
  })
  test('resulting queryKey correctly resolves EXACT type even with variadic tuple length', () => {
    const router = a.router({
      name: 'test',
      routes: [
        a
          .procedure('foo')
          .input((a: number, b: string) => a + b)
          .define(({ input }) => input),
      ],
      adapters: { queryKey },
    })
    const key = router.queryKey.call('foo', 2, 'bar')
    const key2 = router.queryKey.call('foo')
    expectTypeOf(key).toEqualTypeOf<readonly ['call/test/foo', 2, 'bar']>()
    expectTypeOf(key).not.toEqualTypeOf<readonly ['call/test/foo']>()
    expectTypeOf(key2).not.toEqualTypeOf<readonly ['call/test/foo', 2, 'bar']>()
  })
  test('when no arg is provided, it correctly defaults to [encodeKey]', () => {
    const router = a.router({
      name: 'test',
      routes: [
        a
          .procedure('foo')
          .input((a: number, b: string) => a + b)
          .define(({ input }) => input),
      ],
      adapters: { queryKey },
    })
    const key2 = router.queryKey.call('foo')
    expectTypeOf(key2).toEqualTypeOf<readonly ['call/test/foo']>()
  })
})
