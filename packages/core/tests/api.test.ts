import { describe, expect, expectTypeOf, test } from 'vitest'
import { z } from 'zod'
import { api } from '../src/api'

describe('sdk', () => {
  test('works with 0 args', () => {
    const a = api()
    expect(a).toBeDefined()
    expect(a.router).toBeTypeOf('function')
    expect(a.procedure).toBeTypeOf('function')
  })
  test('works with context', () => {
    const a = api({ context: { foo: 'foo' } })
    expect(a).toBeDefined()
    expect(a.router).toBeTypeOf('function')
    expect(a.procedure).toBeTypeOf('function')
  })
})

describe('integrations', () => {
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

describe('groups', () => {
  test('groups context ', async () => {
    const a = api({
      context: { foo: 'foo' },
    })
      .group('obj', { context: { baz: 'baz' } })
      .group('fn', { context: (options) => ({ ...options.context, bar: 'bar' }) as const })
      .group('async', { context: async (options) => ({ ...options.context, asyncBar: 'asyncBar' }) as const })
      .group('noCustomContext')
    const r = a.router({
      name: 'test',
      routes: [
        a.obj('a').define(({ context }) => context.baz),
        a.fn('b').define(({ context }) => context.bar),
        a.async('c').define(({ context }) => context.asyncBar),
        a.noCustomContext('d').define(({ context }) => context.foo),
        a.procedure('e').define(({ context }) => context.foo),
      ],
    })
    expect(r.call('a')).toStrictEqual('baz')
    expectTypeOf(r.call('a')).toEqualTypeOf<'baz'>()
    expect(r.call('b')).toStrictEqual('bar')
    expectTypeOf(r.call('b')).toEqualTypeOf<'bar'>()
    expect(r.call('c')).resolves.toStrictEqual('asyncBar')
    expectTypeOf(r.call('c')).toEqualTypeOf<Promise<'asyncBar'>>()
    expect(r.call('d')).toStrictEqual('foo')
    expectTypeOf(r.call('d')).toEqualTypeOf<'foo'>()
    expect(r.call('e')).toStrictEqual('foo')
    expectTypeOf(r.call('e')).toEqualTypeOf<'foo'>()
  })
  test('override change show group works', () => {
    const a = api().group('override', { _override: (options) => () => options.meta.group })
    expect(a.override()).toStrictEqual('override')
    expectTypeOf(a.override()).toEqualTypeOf<'override'>()
    const r = a.router({
      name: 'test',
      routes: [a.procedure('a').define(() => null)],
    })
    expect(r.call('a')).toBeNull()
    expectTypeOf(r.call('a')).toEqualTypeOf<null>()
  })
  test('default input', () => {
    const a = api()
      .group('schema', { defaultInput: z.string() })
      .group('fn', {
        defaultInput: (id: string) => {
          if (typeof id !== 'string') {
            throw new Error('id must be a string')
          }
          return id
        },
      })
    const r = a.router({
      name: 'test',
      routes: [
        a.schema('a').define(({ input }) => input),
        a.fn('b').define(({ input }) => input),
        a.procedure('c').define(() => 'noInput' as const),
      ],
    })
    expect(r.call('a', 'bar')).toStrictEqual('bar')
    expectTypeOf(r.call('a', 'bar')).toEqualTypeOf<string>()
    expect(r.call('b', 'bar')).toStrictEqual('bar')
    expectTypeOf(r.call('b', 'bar')).toEqualTypeOf<string>()
    // @ts-expect-error intentially bad type to throw error
    expect(() => r.call('a', 2)).toThrow()
    // @ts-expect-error intentially bad type to throw error
    expect(() => r.call('b', 2)).toThrow()
    expect(r.call('c')).toStrictEqual('noInput')
    expectTypeOf(r.call('c')).toEqualTypeOf<'noInput'>()
  })
  test('default input override', () => {
    const a = api()
      .group('schema', { defaultInput: z.string() })
      .group('fn', {
        defaultInput: (id: string) => {
          if (typeof id !== 'string') {
            throw new Error('id must be a string')
          }
          return id
        },
      })
    const r = a.router({
      name: 'test',
      routes: [
        a
          .schema('a')
          .input(z.number())
          .define(({ input }) => input),
        a
          .fn('b')
          .input((id: number) => {
            if (typeof id !== 'number') {
              throw new Error('id must be a number')
            }
            return id
          })
          .define(({ input }) => input),
        a
          .procedure('c')
          .input(z.number())
          .define(({ input }) => input),
      ],
    })
    expect(r.call('a', 2)).toStrictEqual(2)
    expectTypeOf(r.call('a', 2)).toEqualTypeOf<number>()
    expect(r.call('b', 2)).toStrictEqual(2)
    expectTypeOf(r.call('b', 2)).toEqualTypeOf<number>()
    expect(r.call('c', 2)).toStrictEqual(2)
    expectTypeOf(r.call('c', 2)).toEqualTypeOf<number>()
    // @ts-expect-error intentially bad type to throw error
    expect(() => r.call('a', 'bar')).toThrow()
    // @ts-expect-error intentially bad type to throw error
    expect(() => r.call('b', 'bar')).toThrow()
    // @ts-expect-error intentially bad type to throw error
    expect(() => r.call('c', 'bar')).toThrow()
  })
  test('default output', () => {
    const a = api()
      .group('schema', { defaultOutput: z.string() })
      .group('fn', {
        defaultOutput: (id: string) => {
          if (typeof id !== 'string') {
            throw new Error('id must be a string')
          }
          return id
        },
      })
    const r = a.router({
      name: 'test',
      routes: [a.schema('a').define(() => 'a'), a.fn('b').define(() => 'bar'), a.procedure('c').define(() => 'bar')],
    })
    expect(r.call('a')).toStrictEqual('a')
    expectTypeOf(r.call('a')).toEqualTypeOf<string>()
    expect(r.call('b')).toStrictEqual('bar')
    expectTypeOf(r.call('b')).toEqualTypeOf<string>()
    expect(r.call('c')).toStrictEqual('bar')
    expectTypeOf(r.call('c')).toEqualTypeOf<string>()
    expect(() =>
      a
        .schema('a')
        // @ts-expect-error intentially bad type to throw error
        .define(() => 2)
        .fn()
    ).toThrow()
  })
  test('default output override', () => {
    const a = api()
      .group('schema', { defaultOutput: z.string() })
      .group('fn', {
        defaultOutput: (id: string) => {
          if (typeof id !== 'string') {
            throw new Error('id must be a string')
          }
          return id
        },
      })
    const r = a.router({
      name: 'test',
      routes: [
        a
          .schema('a')
          .output(z.number())
          .define(() => 2),
        a
          .fn('b')
          .output(z.number())
          .define(() => 2),
        a
          .procedure('c')
          .output(z.number())
          .define(() => 2),
      ],
    })
    expect(r.call('a')).toStrictEqual(2)
    expectTypeOf(r.call('a')).toEqualTypeOf<number>()
    expect(r.call('b')).toStrictEqual(2)
    expectTypeOf(r.call('b')).toEqualTypeOf<number>()
    expect(r.call('c')).toStrictEqual(2)
    expectTypeOf(r.call('c')).toEqualTypeOf<number>()
    expect(() =>
      a
        .schema('a')
        .output(z.number())
        // @ts-expect-error intentially bad type to throw error
        .define(() => 'sss')
        .fn()
    ).toThrow()
  })
})

describe('default method', () => {
  test('global methods', () => {
    const a = api({
      defaultMethod: 'boo',
    })
    const r = a.router({
      name: 'test',
      routes: [a.procedure('a').define(({ meta }) => meta.method)],
    })
    expect(r.boo).toBeTypeOf('function')
    expect(r.boo('a')).toStrictEqual('boo')
    expectTypeOf(r.boo('a')).toEqualTypeOf<'boo'>()
  })
  test('group default method', () => {
    const a = api().group('boo', { defaultMethod: 'boo' }).group('foo', { defaultMethod: 'foo' })
    const r = a.router({
      name: 'test',
      routes: [a.boo('a').define(({ meta }) => meta.method), a.foo('b').define(({ meta }) => meta.method)],
    })
    expect(r.boo).toBeTypeOf('function')
    expect(r.foo).toBeTypeOf('function')
    expect(r.boo('a')).toStrictEqual('boo')
    expectTypeOf(r.boo('a')).toEqualTypeOf<'boo'>()
    expect(r.foo('b')).toStrictEqual('foo')
    expectTypeOf(r.foo('b')).toEqualTypeOf<'foo'>()
  })
  test('group with global default method', () => {
    const a = api({ defaultMethod: 'boo' }).group('foo', { defaultMethod: 'foo' })
    const r = a.router({
      name: 'test',
      routes: [a.procedure('a').define(({ meta }) => meta.method), a.foo('b').define(({ meta }) => meta.method)],
    })
    expect(r.boo).toBeTypeOf('function')
    expect(r.foo).toBeTypeOf('function')
    expect(r.boo('a')).toStrictEqual('boo')
    expectTypeOf(r.boo('a')).toEqualTypeOf<'boo'>()
    expect(r.foo('b')).toStrictEqual('foo')
    expectTypeOf(r.foo('b')).toEqualTypeOf<'foo'>()
  })
})
