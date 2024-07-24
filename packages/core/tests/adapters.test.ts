import { describe, expect, expectTypeOf, test } from 'vitest'
import { z } from 'zod'
import { api } from '../src/api'

describe('adapters', () => {
  const a = api()
  const router = a.router({
    name: 'test',
    routes: [
      a.procedure('ooo').define(() => null),
      a
        .procedure('arg')
        .input((id: number) => id)
        .define(({ input }) => input),
    ],
    adapters: {
      query: () => (bar: string) => 'foo' + bar,
    },
  })
  test('adapter works', () => {
    expect(router.query('bar')).toStrictEqual('foobar')
    expectTypeOf(router.query('bar')).toEqualTypeOf<string>()
  })
  test('vanilla calls still work', () => {
    expect(router.call('ooo')).toBeNull()
    expectTypeOf(router.call('ooo')).toEqualTypeOf<null>()
    expect(router.call('arg', 2)).toStrictEqual(2)
    expectTypeOf(router.call('arg', 2)).toEqualTypeOf<number>()
  })
  test('integrations get passed correct context', () => {
    const b = api({
      context: { foo: 'foo' },
    })
    const r2 = b.router({
      name: 'withContext',
      adapters: {
        query:
          ({ context }) =>
          () =>
            context.foo,
      },
      routes: [],
    })
    expect(r2.query()).toStrictEqual('foo')
  })
  test('adapter can call passed methods', () => {
    const b = api({
      context: { foo: 'foo' },
    })
    const r2 = b.router({
      name: 'withContext',
      routes: [
        b
          .procedure('log')
          .input(z.string())
          .define(({ input }) => input),
      ],
      adapters: {
        adp: (adapter) => (bar: string) => adapter.invoke('call', 'log', bar),
      },
    })
    expect(r2.adp('bar')).toStrictEqual('bar')
    expectTypeOf(r2.adp('bar')).toEqualTypeOf<string>()
  })
  test('async context', () => {
    const b = api({
      context: {
        asyncFoo: async () => ({ foo: 'foo' }),
      },
    })
    const r2 = b.router({
      name: 'asyncContext',
      routes: [
        b
          .procedure('log')
          .input(z.string())
          .define(async ({ input, context }) => {
            const { foo } = await context.asyncFoo()
            return foo + input
          }),
      ],
    })
    expect(r2.call('log', 'bar')).resolves.toStrictEqual('foobar')
  })
})
