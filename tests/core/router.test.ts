import { api } from '@/core/src/api'
import { router } from '@/core/src/router'
import { describe, expect, test } from 'bun:test'

describe('functionality', () => {
  test('router initializes correctly', () => {
    const r = router({})('test')
    expect(r).toBeDefined()
  })
  test('router has correct internal call name', () => {
    const r = router({})('test')
    expect(r.routerName).toStrictEqual('test')
  })
  test('router has correct routes', () => {
    const r = router({})(
      'test',
      api.route('foo').procedure(() => 'foo'),
      api.route('bar').procedure(() => 'bar')
    )
    expect(r.routeNames).toStrictEqual(['foo', 'bar'])
  })
  test('router propagates context', () => {
    const r = router({ bar: 'bar' })(
      'test',
      api.route('foo').procedure(() => 'foo')
    )
    expect(r.context).toStrictEqual({ bar: 'bar' })
  })
  test('router calls procedures correctly', () => {
    const r = router({})(
      'test',
      api.route('foo').procedure(() => 'foo'),
      api.route('bar').procedure(() => 'bar')
    )
    expect(r.call('foo')).toStrictEqual('foo')
    expect(r.call('bar')).toStrictEqual('bar')
  })
  test('router calls procedures with arguments correctly', () => {
    const r = router({})(
      'test',
      api.route('foo').procedure((a: number, b: number) => a + b)
    )
    expect(r.call('foo', 1, 2)).toStrictEqual(3)
  })
  test('router correctly determines methods', () => {
    const r = router({})(
      'test',
      api.route('foo').procedure(() => 'foo'),
      api.route('get').request('GET', () => 'get'),
      api.route('post').request('POST', () => 'post')
    )
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
    const r = router({})(
      'test',
      api.route('get').request('GET', () => 'get'),
      api.route('post').request('POST', () => 'post')
    )
    // @ts-expect-error undefined methods
    expect(r.call).toBeUndefined()
    expect(r.get).toBeFunction()
    expect(r.post).toBeFunction()
  })
})

describe('corner cases', () => {
  test('router with duplicate keys & methods throws', () => {
    try {
      router({})(
        'test',
        api.route('foo').procedure(() => 'foo'),
        api.route('foo').procedure(() => 'foo')
      )
    } catch (e) {
      expect(e).toBeInstanceOf(Error)
      expect((e as Error).message).toStrictEqual('Route "foo" with method "call" already exists')
    }
  })
  test('router with duplicate keys but separate methods works', () => {
    const r = router({})(
      'test',
      api.route('foo').request(
        'POST',
        () => 'http://api.com/post',
        (req) => req
      ),
      api.route('foo').request(
        'GET',
        () => 'http://api.com/get',
        (req) => req
      )
    )
    expect(r.post('foo')).toStrictEqual('http://api.com/post')
    expect(r.get('foo')).toStrictEqual('http://api.com/get')
  })
  test('routermap with duplicate keys but separate methods works', () => {
    const r = router({})(
      'test',
      api.route('foo').request(
        'POST',
        () => 'http://api.com/post',
        (req) => req
      ),
      api.route('foo').request(
        'GET',
        () => 'http://api.com/get',
        (req) => req
      ),
      api.route('some').request(
        'GET',
        () => 'http://api.com/some',
        (req) => req
      )
    )
    expect(r.routerMap.post.foo).toBeDefined()
    expect(r.routerMap.get.foo).toBeDefined()
    expect(r.routerMap.get.some).toBeDefined()
    // @ts-expect-error undefined methods (ts correctly raises error)
    expect(r.routerMap.post.some).toBeUndefined()
  })
})