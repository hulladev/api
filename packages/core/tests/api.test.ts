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
  test('type modifier + transforms', () => {
    const a = api()
    const r = a.router({
      name: 'test',
      routes: [
        a
          .procedure('a')
          .output((id: number) => id)
          .define(() => 2),
        a
          .procedure('b')
          .input(z.string())
          .output((id: number) => id)
          .define(({ input }) => +input),
        a
          .procedure('c')
          .output(z.number())
          .define(() => 2),
        a
          .procedure('d')
          .input(z.string())
          .output(z.number())
          .define(({ input }) => +input),
        a
          .procedure('e')
          .output((id: number) => id)
          .define(() => 2),
        a
          .procedure('f')
          .input((id: string) => id)
          .output((id: number) => id)
          .define(({ input }) => +input),
        a
          .procedure('async')
          .output(z.promise(z.number()))
          .define(async () => 2),
      ],
    })
    expect(r.call('a')).toStrictEqual(2)
    expectTypeOf(r.call('a')).toEqualTypeOf<number>()
    expect(r.call('b', '2')).toStrictEqual(2)
    expectTypeOf(r.call('b', '2')).toEqualTypeOf<number>()
    expect(r.call('c')).toStrictEqual(2)
    expectTypeOf(r.call('c')).toEqualTypeOf<number>()
    expect(r.call('d', '2')).toStrictEqual(2)
    expectTypeOf(r.call('d', '2')).toEqualTypeOf<number>()
    expect(r.call('e')).toStrictEqual(2)
    expectTypeOf(r.call('e')).toEqualTypeOf<number>()
    expect(r.call('f', '2')).toStrictEqual(2)
    expectTypeOf(r.call('f', '2')).toEqualTypeOf<number>()
    expect(r.call('async')).resolves.toStrictEqual(2)
    expectTypeOf(r.call('async')).resolves.toEqualTypeOf<number>()
    expectTypeOf(r.call('async')).toEqualTypeOf<Promise<number>>()
  })
  // default method is tested in methods.test.ts 💡
  test('default input schema', () => {
    const a = api({
      defaults: {
        input: z.string(),
      },
    })
    const r = a.router({
      name: 'test',
      routes: [
        a.procedure('a').define(({ input }) => input),
        a
          .procedure('b')
          .input(z.number())
          .define(({ input }) => input),
      ],
    })
    expect(r.call('a', 'a')).toStrictEqual('a')
    expectTypeOf(r.call('a', 'a')).toEqualTypeOf<string>()
    expect(r.call('b', 2)).toStrictEqual(2)
    expectTypeOf(r.call('b', 2)).toEqualTypeOf<number>()
  })
  test('default output schema', () => {
    const a = api({
      defaults: {
        output: z.number(),
      },
    })
    const r = a.router({
      name: 'test',
      routes: [
        a.procedure('a').define(() => 2),
        a
          .procedure('b')
          .output(z.string())
          .define(() => '2'),
      ],
    })
    expect(r.call('a')).toStrictEqual(2)
    expectTypeOf(r.call('a')).toEqualTypeOf<number>()
    expect(r.call('b')).toStrictEqual('2')
    expectTypeOf(r.call('b')).toEqualTypeOf<string>()
  })
  test('default input fn', () => {
    const a = api({
      defaults: {
        input: (id: string) => {
          if (typeof id !== 'string') {
            throw new Error('id must be a string')
          }
          return id
        },
      },
    })
    const r = a.router({
      name: 'test',
      routes: [
        a.procedure('a').define(({ input }) => input),
        a
          .procedure('b')
          .input(z.number())
          .define(({ input }) => input),
      ],
    })
    expect(r.call('a', 'a')).toStrictEqual('a')
    expectTypeOf(r.call('a', 'a')).toEqualTypeOf<string>()
    expect(r.call('b', 2)).toStrictEqual(2)
    expectTypeOf(r.call('b', 2)).toEqualTypeOf<number>()
  })
  test('default output fn', () => {
    const a = api({
      defaults: {
        output: (id: string) => {
          if (typeof id !== 'string') {
            throw new Error('id must be a string')
          }
          return id
        },
      },
    })
    const r = a.router({
      name: 'test',
      routes: [
        a.procedure('a').define(() => '2'),
        a
          .procedure('b')
          .output(z.number())
          .define(() => 2),
      ],
    })
    expect(r.call('a')).toStrictEqual('2')
    expectTypeOf(r.call('a')).toEqualTypeOf<string>()
    expect(r.call('b')).toStrictEqual(2)
    expectTypeOf(r.call('b')).toEqualTypeOf<number>()
  })
})
