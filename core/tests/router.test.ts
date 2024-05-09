import { describe, expect, test } from 'bun:test'
import { api } from '../src/api'
import { router } from '../src/router'

describe('functionality', () => {
  const r = router({ bar: 'bar' })({
    name: 'test',
    routes: [api.procedure('foo', () => 'foo'), api.procedure('bar', () => 'bar')],
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
    const r = router({})({ name: 'test', routes: [api.procedure('foo', (a: number, b: number) => a + b)] })
    expect(r.call('foo', 1, 2)).toStrictEqual(3)
  })
  test('router correctly determines methods', () => {
    const r = router({})({
      name: 'test',
      routes: [
        api.procedure('foo', () => 'foo'),
        api.request.get('get', () => 'get'),
        api.request.post('post', () => 'post'),
      ],
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
  test('router doesnt have call with only requests', () => {
    const r = router({})({
      name: 'test',
      routes: [api.request.get('get', () => 'get'), api.request.post('post', () => 'post')],
    })
    // @ts-expect-error undefined methods
    expect(r.call).toBeUndefined()
    expect(r.get).toBeFunction()
    expect(r.post).toBeFunction()
  })
  test('router works with custom calls', () => {
    const r = router({})({
      name: 'test',
      routes: [api.custom('foo', 'client', () => 'foo'), api.custom('bar', 'client', () => 'bar')],
    })
    expect(r.client('foo')).toStrictEqual('foo')
    expect(r.client('bar')).toStrictEqual('bar')
  })
})

describe('corner cases', () => {
  test('router with duplicate keys & methods throws', () => {
    try {
      router({})({ name: 'test', routes: [api.procedure('foo', () => 'foo'), api.procedure('foo', () => 'foo')] })
    } catch (e) {
      expect(e).toBeInstanceOf(Error)
      expect((e as Error).message).toStrictEqual('Route "foo" with method "call" already exists')
    }
  })
  test('router with duplicate keys but separate methods works', () => {
    const r = router({})({
      name: 'test',
      routes: [
        api.request.post(
          'foo',
          () => 'http://api.com/post',
          (req) => req
        ),
        api.request.get(
          'foo',
          () => 'http://api.com/get',
          (req) => req
        ),
      ],
    })
    expect(r.post('foo')).toStrictEqual('http://api.com/post')
    expect(r.get('foo')).toStrictEqual('http://api.com/get')
  })
  test('mappedRouter with duplicate keys but separate methods works', () => {
    const r = router({})({
      name: 'test',
      routes: [
        api.request.post(
          'foo',
          () => 'http://api.com/post',
          (req) => req
        ),
        api.request.get(
          'foo',
          () => 'http://api.com/get',
          (req) => req
        ),
        api.request.get(
          'some',
          () => 'http://api.com/some',
          (req) => req
        ),
      ],
    })
    expect(r.mappedRouter.post.foo).toBeDefined()
    expect(r.mappedRouter.get.foo).toBeDefined()
    expect(r.mappedRouter.get.some).toBeDefined()
    // @ts-expect-error undefined methods (ts correctly raises error)
    expect(r.mappedRouter.post.some).toBeUndefined()
  })
})

describe('interceptors', () => {
  const sum = (a: number, b: number) => a + b
  test('argInterceptor', () => {
    const r = router({})({
      name: 'router',
      routes: [api.procedure('sum', sum), api.procedure('sumString', sum, (res) => res.toString())],
      // but good for testing purposes
      argInterceptor: ({ args, route }) => {
        if (route === 'sum') {
          // @ts-expect-error ts cant guarantee from route name alone it will match arg type
          expect(args).toStrictEqual([1, 1])
          return
        }
        // @ts-expect-error ts cant guarantee from route name alone it will match arg type
        expect(args).toStrictEqual([2, 2])
      },
    })
    expect(r.call('sum', 1, 1)).toStrictEqual(2)
    expect(r.call('sumString', 2, 2)).toStrictEqual('4')
  })
  test('resultInterceptor', () => {
    const r = router({})({
      name: 'router',
      routes: [api.procedure('sum', sum), api.procedure('sumString', sum, (res) => res.toString())],
      resultInterceptor: ({ result, args, route }) => {
        // @ts-expect-error ts cant guarantee from route name alone it will match arg type
        expect(args).toStrictEqual([1, 1])
        if (route === 'sum') {
          // @ts-expect-error ts cant guarantee from route name alone it will match return type
          expect(result).toStrictEqual(2)
          return
        }
        // @ts-expect-error ts cant guarantee from route name alone it will match return type
        expect(result).toStrictEqual('2')
      },
    })
    expect(r.call('sum', 1, 1)).toStrictEqual(2)
    expect(r.call('sumString', 1, 1)).toStrictEqual('2')
  })
})
