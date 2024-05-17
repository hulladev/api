import { describe, expect, test } from 'vitest'
import { api } from '../src/api'
import { router } from '../src/router'
import { Args, Call, Fn } from '../src/types'

const a = api()
describe('functionality', () => {
  const r = router({ bar: 'bar' })({
    name: 'test',
    routes: [a.procedure('foo', () => 'foo'), a.procedure('bar', () => 'bar')],
  })
  test('router initializes correctly', () => {
    expect(r).toBeDefined()
  })
  test('router has correct internal call name', () => {
    expect(r.routerName).toStrictEqual('test')
  })
  test('router has correct routes', () => {
    expect(r.routeNames).toStrictEqual(['foo', 'bar'])
  })
  test('router propagates context', () => {
    expect(r.context).toStrictEqual({ bar: 'bar' })
  })
  test('router calls procedures correctly', () => {
    expect(r.call('foo')).toStrictEqual('foo')
    expect(r.call('bar')).toStrictEqual('bar')
  })
  test('router calls procedures with arguments correctly', () => {
    const r = router({})({ name: 'test', routes: [a.procedure('foo', (a: number, b: number) => a + b)] })
    expect(r.call('foo', 1, 2)).toStrictEqual(3)
  })
  test('router correctly determines methods', () => {
    const b = api({
      methods: () => ({
        get: (): Call<'get', 'get', Record<string, never>, [], 'get'> => ({
          route: 'get',
          fn: () => 'get',
          method: 'get',
        }),
        post: (): Call<'post', 'post', Record<string, never>, [], 'post'> => ({
          route: 'post',
          fn: () => 'post',
          method: 'post',
        }),
      }),
    })
    const r = router({})({
      name: 'test',
      routes: [b.procedure('foo', () => 'foo'), b.post(), b.get()],
    })
    expect(r.call).toBeDefined()
    expect(r.get).toBeDefined()
    expect(r.post).toBeDefined()
    // @ts-expect-error undefined methods
    expect(r.patch).toBeUndefined()
    // @ts-expect-error undefined methods
    expect(r.put).toBeUndefined()
    // ...etc
  })
  test('router doesnt have call with no routes', () => {
    const r = router({})({
      name: 'test',
      routes: [],
    })
    // @ts-expect-error undefined methods
    expect(r.call).toBeUndefined()
  })
})

describe('corner cases', () => {
  test('router with duplicate keys & methods throws', () => {
    try {
      router({})({ name: 'test', routes: [a.procedure('foo', () => 'foo'), a.procedure('foo', () => 'foo')] })
    } catch (e) {
      expect(e).toBeInstanceOf(Error)
      expect((e as Error).message).toStrictEqual('Route "foo" with method "call" already exists')
    }
  })
  test('router with duplicate keys but separate methods works', () => {
    const b = api({
      methods: () => ({
        get: <const N extends string, A extends Args, R>(
          route: N,
          fn: Fn<A, R>
        ): Call<N, 'get', Record<string, never>, A, R> => ({
          route,
          fn,
          method: 'get',
        }),
      }),
    })
    const r = router({})({
      name: 'test',
      routes: [
        b.procedure(
          'foo',
          () => 'http://api.com/foo',
          (req) => req
        ),
        b.get('foo', () => 'http://api.com/get'),
      ],
    })
    expect(r.call('foo')).toStrictEqual('http://api.com/foo')
    expect(r.get('foo')).toStrictEqual('http://api.com/get')
    expect(r.mappedRouter.get.foo).toBeDefined()
    expect(r.mappedRouter.call.foo).toBeDefined()
  })
})

describe('interceptors', () => {
  test('argInterceptor', () => {
    const argRouter = a.router({
      name: 'args',
      routes: [
        a.procedure('fn only', (id: number) => id),
        a.procedure(
          'resolver',
          (id: number) => id,
          (res) => res.toString()
        ),
      ],
      interceptors: {
        args: (ctx) => [(ctx.args[0] as number) + 1] as const,
      },
    })
    expect(argRouter.call('fn only', 1)).toStrictEqual(2)
    expect(argRouter.call('resolver', 1)).toStrictEqual('2')
  })
  test('fnInterceptor', () => {
    const fnRouter = a.router({
      name: 'fn',
      routes: [
        a.procedure('fn only', (id: number) => id),
        a.procedure(
          'resolver',
          (id: number) => id,
          (res) => res.toString()
        ),
      ],
      interceptors: {
        fn: (ctx) => ctx.result + 1,
      },
    })
    expect(fnRouter.call('fn only', 1)).toStrictEqual(2)
    expect(fnRouter.call('resolver', 1)).toStrictEqual('2')
  })
  test('resolverInterceptor', () => {
    const fnRouter = a.router({
      name: 'res',
      routes: [
        a.procedure('fn only', (id: number) => id),
        a.procedure(
          'resolver',
          (id: number) => id,
          (res) => res.toString()
        ),
      ],
      interceptors: {
        resolver: (ctx) => ctx.result + 1,
      },
    })
    expect(fnRouter.call('fn only', 1)).toStrictEqual(1) // returns before resolverInterceptor hits
    expect(fnRouter.call('resolver', 1)).toStrictEqual('11') // '1' + 1 === '11'
  })
  test('combined', () => {
    const rt = a.router({
      name: 'combined',
      routes: [
        a.procedure('fn only', (id: number) => id),
        a.procedure(
          'resolver',
          (id: number) => id,
          (res) => res.toString()
        ),
      ],
      interceptors: {
        args: (ctx) => [ctx.args[0] + 1] as const,
        fn: (ctx) => ctx.result + 1,
        resolver: (ctx) => ctx.result + 1,
      },
    })
    expect(rt.call('fn only', 1)).toStrictEqual(3) // arg + fn
    expect(rt.call('resolver', 1)).toStrictEqual('31') // arg + fn + resolver
  })
  test('narrowing types', () => {
    const reusable = (res: string, ctx: { foo: string }) => ctx.foo + res
    const b = api({ context: { foo: 'foo' } })
    const rt = b.router({
      name: 'narrow',
      routes: [
        b.procedure(
          'num',
          (a: number) => a,
          (res) => res
        ),
        b.procedure('str', (a: string) => a, reusable),
      ],
      interceptors: {
        fn: (ctx) => {
          if (ctx.route === 'num') {
            return (ctx.result as number) + 1
          }
          return (ctx.result as string) + 'baz'
        },
      },
    })
    expect(rt.call('num', 1)).toStrictEqual(2)
    expect(rt.call('str', 'bar')).toStrictEqual('foobarbaz')
  })
})
