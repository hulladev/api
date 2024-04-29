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
      api.procedure('foo', () => 'foo'),
      api.procedure('bar', () => 'bar')
    )
    expect(r.routeNames).toStrictEqual(['foo', 'bar'])
  })
  test('router propagates context', () => {
    const r = router({ bar: 'bar' })(
      'test',
      api.procedure('foo', () => 'foo')
    )
    expect(r.context).toStrictEqual({ bar: 'bar' })
  })
  test('router calls procedures correctly', () => {
    const r = router({})(
      'test',
      api.procedure('foo', () => 'foo'),
      api.procedure('bar', () => 'bar')
    )
    expect(r.call('foo')).toStrictEqual('foo')
    expect(r.call('bar')).toStrictEqual('bar')
  })
  test('router calls procedures with arguments correctly', () => {
    const r = router({})(
      'test',
      api.procedure('foo', (a: number, b: number) => a + b)
    )
    expect(r.call('foo', 1, 2)).toStrictEqual(3)
  })
  test('router correctly determines methods', () => {
    const r = router({})(
      'test',
      api.procedure('foo', () => 'foo'),
      api.request('get', 'GET', () => 'get'),
      api.request('post', 'POST', () => 'post')
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
      api.request('get', 'GET', () => 'get'),
      api.request('post', 'POST', () => 'post')
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
        api.procedure('foo', () => 'foo'),
        api.procedure('foo', () => 'foo')
      )
    } catch (e) {
      expect(e).toBeInstanceOf(Error)
      expect((e as Error).message).toStrictEqual('Route "foo" with method "call" already exists')
    }
  })
  test('router with duplicate keys but separate methods works', () => {
    const r = router({})(
      'test',
      api.request(
        'foo',
        'POST',
        () => 'http://api.com/post',
        (req) => req
      ),
      api.request(
        'foo',
        'GET',
        () => 'http://api.com/get',
        (req) => req
      )
    )
    expect(r.post('foo')).toStrictEqual('http://api.com/post')
    expect(r.get('foo')).toStrictEqual('http://api.com/get')
  })
  test('mappedRouter with duplicate keys but separate methods works', () => {
    const r = router({})(
      'test',
      api.request(
        'foo',
        'POST',
        () => 'http://api.com/post',
        (req) => req
      ),
      api.request(
        'foo',
        'GET',
        () => 'http://api.com/get',
        (req) => req
      ),
      api.request(
        'some',
        'GET',
        () => 'http://api.com/some',
        (req) => req
      )
    )
    expect(r.mappedRouter.post.foo).toBeDefined()
    expect(r.mappedRouter.get.foo).toBeDefined()
    expect(r.mappedRouter.get.some).toBeDefined()
    // @ts-expect-error undefined methods (ts correctly raises error)
    expect(r.mappedRouter.post.some).toBeUndefined()
  })
})
