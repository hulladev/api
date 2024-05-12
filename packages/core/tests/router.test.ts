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
    expect(r.call).toBeFunction()
    expect(r.get).toBeFunction()
    expect(r.post).toBeFunction()
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
