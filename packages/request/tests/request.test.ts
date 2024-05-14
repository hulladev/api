import { expectTypeOf } from 'expect-type'
import { afterAll, beforeAll, beforeEach, describe, expect, test } from 'vitest'
import { request } from '../src/request'
import { resolve } from '../src/resolve'
import { rq } from '../src/rq'
import { API_URL, createServer, mockCtx, users } from './mock-api'

const getUsers = request().get('/users', () => `${API_URL}/users`)
const getUsersConfig = request().get('/users', () => ({ url: `${API_URL}/users` }))
const withResolver = request().get(
  '/usersResolve',
  () => ({ url: `${API_URL}/users` }),
  (request) => fetch(request.url).then((res) => res.json() as Promise<{ users: { id: number; name: string }[] }>)
)
const getUserById = request().get('/user/:id', (id: number) => `${API_URL}/users/${id}`)
const example = request().post('/example', () => `${API_URL}/example`)

const server = createServer()
beforeAll(() => server.listen())
beforeEach(() => server.resetHandlers())
afterAll(() => server.close())

describe('functionality', () => {
  test('request has correct internal call name', () => {
    expect(getUsers.method).toStrictEqual('get')
    expect(getUsersConfig.method).toStrictEqual('get')
  })
  // standardly we'll be invoking from a router, but for unit testing we have to do with mocking the context
  test('requests resolve correctly', () => {
    expect(withResolver.resolver?.(withResolver.fn(), mockCtx('/usersResolve', 'get', []))).resolves.toStrictEqual({
      users,
    })
    expect(
      getUserById.resolver?.(getUserById.fn(0), mockCtx('/user/:id', 'get', [0])).then((res) => res.json())
    ).resolves.toStrictEqual(users[0])
    expect(
      example.resolver?.(example.fn(), mockCtx('/example', 'post', [])).then((res) => res.json())
    ).resolves.toStrictEqual({
      foo: 'bar',
    })
  })
  test('static configs return correct config', () => {
    expect(request().get('/users', 'http://api.com/users').fn()).toStrictEqual('http://api.com/users')
    expect(request().get('/users', { url: 'http://api.com/users' }).fn()).toStrictEqual({
      url: 'http://api.com/users',
    })
  })
  test('static configs resolve correctly', () => {
    const staticcfgwr = request().get('/users', 'http://api.com/users', resolve<{ users: typeof users }>)
    expect(staticcfgwr.resolver?.(staticcfgwr.fn(), mockCtx('/users', 'get', []))).resolves.toStrictEqual({
      users,
    })
  })
  test('with rq', () => {
    request().post('/example', rq({ url: 'aaa', method: 'POST' }))
    request().post('/example', rq({ url: 'bb/:userId/?w', method: 'POST', params: { userId: '1', w: 'w' } }))
    request().post('/example', () => rq({ url: 'bb/:userId/?w', method: 'POST', params: { userId: '1', w: 'w' } }))
  })
})

// note these will always pass in a test suite - however they do throw a type error in IDE/build time
// which we can detect in ci/cd
describe('types', () => {
  test('request has correct internal call name type', () => {
    expectTypeOf(getUsers.method).toEqualTypeOf<'get'>()
    expectTypeOf(getUsersConfig.method).toEqualTypeOf<'get'>()
  })
  test('request has correct type', () => {
    expectTypeOf(getUsers.fn).returns.toEqualTypeOf<'http://api.com/users'>()
    expectTypeOf(withResolver.resolver).returns.toEqualTypeOf<Promise<{ users: { name: string; id: number }[] }>>()
  })
})

describe('dynamic paths / search params', () => {
  test('static rq params', () => {
    const req = request().get(
      '/users/:id',
      rq({ url: `${API_URL}/users/:id`, method: 'GET', params: { id: 0 } }),
      resolve<(typeof users)[0]>
    )

    expect(req.fn()).toStrictEqual({ url: 'http://api.com/users/:id', method: 'GET', params: { id: 0 } })
    expect(req.resolver?.(req.fn(), mockCtx('/users/:id', 'get', []))).resolves.toStrictEqual({ id: 0, name: 'John' })
  })
  test('dynamic rq params', () => {
    const dReq = request().get(
      '/users/:id',
      (id: number) => rq({ url: `${API_URL}/users/:id`, method: 'GET', params: { id } }),
      resolve<(typeof users)[number]>
    )
    expect(dReq.fn(1)).toStrictEqual({ url: 'http://api.com/users/:id', method: 'GET', params: { id: 1 } })
    expect(dReq.resolver?.(dReq.fn(1), mockCtx('/users/:id', 'get', [1]))).resolves.toStrictEqual({
      id: 1,
      name: 'Jane',
    })
  })
})
