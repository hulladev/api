import { describe, expect, expectTypeOf, test } from 'vitest'
import { z } from 'zod'
import { api } from '../src/api'

describe('default method', () => {
  test('global methods', () => {
    const a = api({
      defaults: {
        method: 'boo',
      },
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
    const a = api({
      groups: {
        boo: { defaults: { method: 'boo' } },
        foo: { defaults: { method: 'foo' } },
      },
    })
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
    const a = api({ defaults: { method: 'boo' }, groups: { foo: { defaults: { method: 'foo' } } } })
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
  test('allowed methods', () => {
    const a = api({
      allowedMethods: ['foo', 'bar'],
      defaults: {
        method: 'foo',
      },
    })
    const r = a.router({
      name: 'test',
      routes: [
        a
          .procedure('a', 'foo')
          .input(z.number())
          .define(({ meta }) => meta.method + meta.route),
        a
          .procedure('b', 'bar')
          .input(z.boolean())
          .define(({ meta }) => meta.method + meta.route),
        a.procedure('c').define(({ meta }) => meta.method + meta.route),
        a
          .procedure('d')
          .input(z.array(z.number()))
          .define(({ meta }) => meta.method + meta.route),
      ],
    })
    expect(r.foo('a', 2)).toStrictEqual('fooa')
    expectTypeOf(r.foo('a', 2)).toEqualTypeOf<string>()
    expect(r.bar('b', true)).toStrictEqual('barb')
    expectTypeOf(r.bar('b', true)).toEqualTypeOf<string>()
    expect(r.foo('c')).toStrictEqual('fooc')
    expectTypeOf(r.foo('c')).toEqualTypeOf<string>()
    expect(r.foo('d', [1, 2])).toStrictEqual('food')
    expectTypeOf(r.foo('d', [1, 2])).toEqualTypeOf<string>()
  })
  test('group with allowed methods', () => {
    const a = api({
      groups: {
        foo: {
          allowedMethods: ['foo', 'bar'],
          defaults: {
            method: 'foo',
          },
        },
      },
    })
    const r = a.router({
      name: 'test',
      routes: [
        a
          .foo('a', 'foo')
          .input(z.number())
          .define(({ meta }) => meta.method + meta.route),
        a
          .foo('b', 'bar')
          .input(z.boolean())
          .define(({ meta }) => meta.method + meta.route),
        a.foo('c').define(({ meta }) => meta.method + meta.route),
        a
          .foo('d')
          .input(z.array(z.number()))
          .define(({ meta }) => meta.method + meta.route),
      ],
    })
    expect(r.foo).toBeTypeOf('function')
    expect(r.bar).toBeTypeOf('function')
    expect(r.foo('a', 2)).toStrictEqual('fooa')
    expectTypeOf(r.foo('a', 2)).toEqualTypeOf<string>()
    expect(r.bar('b', true)).toStrictEqual('barb')
    expectTypeOf(r.bar('b', true)).toEqualTypeOf<string>()
    expect(r.foo('c')).toStrictEqual('fooc')
  })
})
