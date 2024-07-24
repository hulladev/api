import { describe, expect, expectTypeOf, test } from 'vitest'
import { z } from 'zod'
import { api } from '../src/api'

describe('groups', () => {
  test('groups context ', async () => {
    const a = api({
      context: { foo: 'foo' },
      groups: {
        obj: { context: { baz: 'baz' } },
        fn: {
          context: (options) => ({ ...options.context, bar: 'bar' }) as const,
        },
        async: {
          context: async (options) => ({ ...options.context, asyncBar: 'asyncBar' }) as const,
        },
        noCustomContext: {},
      },
    })

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
  test('default input', () => {
    const a = api({
      groups: {
        schema: { defaults: { input: z.string() } },
        fn: {
          defaults: {
            input: (id: string) => {
              if (typeof id !== 'string') {
                throw new Error('id must be a string')
              }
              return id
            },
          },
        },
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
    const a = api({
      groups: {
        schema: { defaults: { input: z.string() } },
        fn: {
          defaults: {
            input: (id: string) => {
              if (typeof id !== 'string') {
                throw new Error('id must be a string')
              }
              return id
            },
          },
        },
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
    r.call('c', 2)
  })
  test('default output', () => {
    const a = api({
      groups: {
        schema: { defaults: { output: z.string() } },
        fn: {
          defaults: {
            output: (id: string) => {
              if (typeof id !== 'string') {
                throw new Error('id must be a string')
              }
              return id
            },
          },
        },
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
    const a = api({
      groups: {
        schema: { defaults: { output: z.string() } },
        fn: {
          defaults: {
            output: (id: string) => {
              if (typeof id !== 'string') {
                throw new Error('id must be a string')
              }
              return id
            },
          },
        },
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

describe('passing group "integration"', () => {
  test('simple object', () => {
    const request = {
      defaults: {
        method: 'get',
      },
    } as const
    const a = api({
      groups: {
        request,
      },
    })
    const r = a.router({
      name: 'test',
      routes: [a.request('test').define(({ meta }) => meta.method)],
    })
    expect(r.get).toBeTypeOf('function')
    expect(r.get('test')).toStrictEqual('get')
    expectTypeOf(r.get('test')).toEqualTypeOf<'get'>()
  })
  test('inferring option type', () => {
    const a = api({
      context: {
        foo: 'foo',
      },
      groups: {
        manual: {
          context: (options) => ({ ...options.context, bar: 'bar' as const }),
        },
      },
    })

    const r = a.router({
      name: 'test',
      routes: [a.manual('manual').define(({ context }) => context)],
    })
    expect(r.call('manual')).toStrictEqual({ foo: 'foo', bar: 'bar' })
    expectTypeOf(r.call('manual')).toEqualTypeOf<{ foo: 'foo'; bar: 'bar' }>()
  })
})
