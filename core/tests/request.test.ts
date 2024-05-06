import { afterAll, beforeAll, beforeEach, describe, expect, test } from 'bun:test'
import { expectTypeOf } from 'expect-type'
import { request } from '../src/request'
import { resolve } from '../src/resolve'
import { API_URL, createServer, mockCtx, users } from './mock-api'

const getUsers = request()('/users', 'GET', () => `${API_URL}/users`)
const getUsersConfig = request()('/users', 'GET', () => ({ url: `${API_URL}/users` }))
const withResolver = request()(
  '/usersResolve',
  'GET',
  () => ({ url: `${API_URL}/users` }),
  (request) => fetch(request.url).then((res) => res.json() as Promise<{ users: { id: number; name: string }[] }>)
)
const getUserById = request()('/user/:id', 'GET', (id: number) => `${API_URL}/users/${id}`)
const example = request()('/example', 'POST', () => `${API_URL}/example`)

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
    expect
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
    expect(request()('/users', 'GET', 'http://api.com/users').fn()).toStrictEqual('http://api.com/users')
    expect(request()('/users', 'GET', { url: 'http://api.com/users' }).fn()).toStrictEqual({
      url: 'http://api.com/users',
    })
  })
  test('static configs resolve correctly', () => {
    const staticcfgwr = request()('/users', 'GET', 'http://api.com/users', resolve<{ users: typeof users }>)
    expect(staticcfgwr.resolver?.(staticcfgwr.fn(), mockCtx('/users', 'get', []))).resolves.toStrictEqual({
      users,
    })
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
