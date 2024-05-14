import { afterAll, beforeAll, beforeEach, describe, expect, test } from 'vitest'
import { resolve } from '../src/resolve'
import { addParams, parseBody, parseRequest, parseUrl, response } from '../src/response'
import { createServer, mockCtx, users } from './mock-api'

const server = createServer()
beforeAll(() => server.listen())
beforeEach(() => server.resetHandlers())
afterAll(() => server.close())

describe('addParams', () => {
  test('doesnt mutate if no params exist', () => {
    expect(addParams({ url: 'aa.bb.cc' })).toStrictEqual('aa.bb.cc')
  })
  test('path params', () => {
    expect(addParams({ url: 'aa/:bb/cc', params: { bb: 'test' } })).toStrictEqual('aa/test/cc')
  })
  test('search params', () => {
    expect(addParams({ url: 'aa.bb.cc?foo', params: { foo: 'bar' } })).toStrictEqual('aa.bb.cc?foo=bar')
    expect(addParams({ url: 'aa.bb.cc?foo&bar', params: { foo: true, bar: 2 } })).toStrictEqual(
      'aa.bb.cc?foo=true&bar=2'
    )
    expect(addParams({ url: 'a?foo&bar&baz', params: { foo: 1, bar: 2, baz: 3 } })).toStrictEqual('a?foo=1&bar=2&baz=3')
  })
  test('combined', () => {
    expect(addParams({ url: 'users/:userId/cc?foo&bar', params: { userId: 2, foo: true, bar: 'baz' } })).toStrictEqual(
      'users/2/cc?foo=true&bar=baz'
    )
  })
  test('corner case - KITCHEN SINK 🦍', () => {
    expect(
      addParams({
        url: 'users/:userId/cc?foo&bar/:route/something&baz',
        params: { userId: 1, foo: false, 'bar/:route/something': 'eww', route: 'insane', baz: 'bosh' },
      })
    ).toStrictEqual('users/1/cc?foo=false&bar/insane/something=eww&baz=bosh')
  })
})

describe('parseUrl', () => {
  test('parses string correctly', () => {
    const url = 'http://api.com/users'
    expect(parseUrl(url)).toStrictEqual(new URL(url))
  })
  test('parses URL correctly', () => {
    const url = new URL('http://api.com/users')
    expect(parseUrl(url)).toStrictEqual(url)
  })
  test('parses Request correctly', () => {
    const url = new URL('http://api.com/users')
    const req = new Request(url)
    expect(parseUrl(req)).toStrictEqual(url)
  })
  test('request shape object is parsed correctly', () => {
    const url = 'http://api.com/users'
    const req = { url }
    expect(parseUrl(req)).toStrictEqual(new URL(url))
  })
  test('request shape with no url throws', () => {
    const req = {}
    // @ts-expect-error package ts correctly requires url to be passed in obj shape
    expect(() => parseUrl(req)).toThrow()
  })
})

describe('parseBody', () => {
  test('parses string correctly', () => {
    const req = 'http://api.com/users'
    expect(parseBody(req)).toBeUndefined()
  })
  test('parses URL correctly', () => {
    const req = new URL('http://api.com/users')
    expect(parseBody(req)).toBeUndefined()
  })
  test('parses Request correctly', () => {
    const req = new Request('http://api.com/users')
    expect(parseBody(req)).toBeUndefined()
  })
  test('request shape object is parsed correctly', () => {
    const data = { foo: 'bar' }
    const req = { data, url: 'a' }
    expect(parseBody(req)).toStrictEqual(JSON.stringify(data))
  })
  test('request shape with no data nor body passes', () => {
    const req = { url: 'a' }
    const str = 'a'
    expect(parseBody(req)).toStrictEqual(undefined)
    expect(parseBody(str)).toStrictEqual(undefined)
  })
  test('request shape with string data is parsed correctly', () => {
    const data = 'foo'
    const req = { data, url: 'a' }
    expect(parseBody(req)).toStrictEqual(data)
  })
  test('request shape with body is parsed correctly', () => {
    const body = 'foo'
    const req = { body, url: 'c' }
    expect(parseBody(req)).toStrictEqual(body)
  })
  test('body overrides data', () => {
    const data = { foo: 'bar' }
    const body = 'foo'
    const req = { data, body, url: 'a' }
    expect(parseBody(req)).toStrictEqual(body)
  })
})

describe('parseRequest', () => {
  test('parses string correctly', () => {
    const req = 'http://api.com/users'
    const url = new URL(req)
    const ctx = mockCtx('users', 'get', [])
    expect(parseRequest(req, url, undefined, ctx)).toMatchObject({ method: 'get', url })
  })
  test('parses URL correctly', () => {
    const req = new URL('http://api.com/users')
    const url = req
    const ctx = mockCtx('users', 'get', [])
    expect(parseRequest(req, url, undefined, ctx)).toMatchObject({ method: 'get', url })
  })
  test('parses Request correctly', () => {
    const req = new Request('http://api.com/users')
    const url = new URL(req.url)
    const ctx = mockCtx('users', 'get', [])
    expect(parseRequest(req, url, undefined, ctx)).toMatchObject({ method: 'get', url })
  })
  test('request shape object is parsed correctly', () => {
    const req = { url: 'http://api.com/users' }
    const url = new URL(req.url)
    const ctx = mockCtx('users', 'get', [])
    expect(parseRequest(req, url, undefined, ctx)).toMatchObject({ method: 'get', url })
  })
  test('request shape with body is parsed correctly', () => {
    const body = 'foo'
    const req = { body, url: 'http://api.com/users' }
    const url = new URL(req.url)
    const ctx = mockCtx('users', 'get', [])
    expect(parseRequest(req, url, body, ctx)).toMatchObject({ method: 'get', url, body })
  })
})

describe('response', () => {
  test('returns a promise', () => {
    const req = 'http://api.com/users'
    const ctx = mockCtx('users', 'get', [])
    expect(response(req, ctx)).toBeInstanceOf(Promise)
  })
  test('resolves correctly', async () => {
    const req = 'http://api.com/users'
    const ctx = mockCtx('users', 'get', [])
    const res = await response(req, ctx)
    expect(res.ok).toStrictEqual(true)
    expect(res.url).toStrictEqual('http://api.com/users')
  })
})

describe('baseURL', () => {
  test('baseURL is working', async () => {
    const ctx = { ...mockCtx('users', 'get', []), baseURL: 'http://api.com' }
    expect(resolve('/users', ctx)).resolves.toStrictEqual({ users })
  })
})
