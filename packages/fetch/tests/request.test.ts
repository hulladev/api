import { api } from '@hulla/api'
import { instance, resolve, response } from '@hulla/fetch'
import { afterAll, beforeAll, beforeEach, describe, expect, expectTypeOf, test } from 'vitest'
import { addInfer, infer } from '../src/infer'
import { request } from '../src/request'
import { createServer, User, users } from './mockserver'

const server = createServer()
beforeAll(() => server.listen())
beforeEach(() => server.resetHandlers())
afterAll(() => server.close())

const a = api({
  groups: {
    request,
  },
})

describe('standard usage', () => {
  const r = a.router({
    name: 'test',
    routes: [
      a
        .request('full', 'get')
        .define(() => response({ url: 'https://api.com/users', method: 'get' }, { transform: (res) => res.json() })),
      a
        .request('inferredMethod')
        .define(() => response({ url: 'https://api.com/users', method: 'get' }, { transform: (res) => res.json() })),
      a
        .request('post', 'post')
        .define(() => response({ url: 'https://api.com/users', method: 'post' }, { transform: (res) => res.json() })),
      a.request('https://api.com/users').define(infer),
      a
        .request('inferWithInput')
        .input(() => ({ url: 'https://api.com/users', method: 'get' }))
        .define(infer),
    ],
  })
  test('standard requests', () => {
    expect(r.get('full')).resolves.toEqual({ users })
    expect(r.get('inferredMethod')).resolves.toEqual({ users })
    expect(r.post('post')).resolves.toEqual({ id: 4, name: 'Bob' })
  })
  test('with infer', () => {
    expect(r.get('https://api.com/users').then((r) => r.json())).resolves.toEqual({ users })
    expect(r.get('inferWithInput').then((r) => r.json())).resolves.toEqual({ users })
  })
})

describe('instances', () => {
  const i = addInfer(
    instance({ baseURL: 'https://api.com', transform: (res) => res.json() as Promise<Record<string, unknown>> })
  )
  const r = a.router({
    name: 'test',
    routes: [
      a.request('full', 'get').define(() => i.resolve({ url: '/users', method: 'get' })),
      a.request('inferredMethod').define(() => i.resolve({ url: '/users', method: 'get' })),
      a.request('post', 'post').define(() => i.resolve({ url: '/users', method: 'post' })),
      a.request('/users').define(i.infer),
      a
        .request('inferWithInput')
        .input(() => ({ url: '/users', method: 'get' }))
        .define(i.infer),
    ],
  })
  test('standard requests', () => {
    expect(r.get('full')).resolves.toEqual({ users })
    expect(r.get('inferredMethod')).resolves.toEqual({ users })
    expect(r.post('post')).resolves.toEqual({ id: 4, name: 'Bob' })
  })
  test('with infer', () => {
    expect(r.get('/users')).resolves.toEqual({ users })
    expect(r.get('inferWithInput')).resolves.toEqual({ users })
  })
})

test('output modifier', () => {
  const i = instance({ baseURL: 'https://api.com', transform: (res) => res.json() as Promise<Record<string, unknown>> })
  const r = a.router({
    name: 'test',
    routes: [
      a
        .request('https://api.com/users')
        .define((options) => infer(options).then((res) => res.json()) as Promise<{ users: User[] }>),
      a
        .request('withOutput')
        .output(async (usersObj: Promise<{ users: User[] }>) => {
          const usersObjRes = await usersObj
          if (!usersObjRes.users) throw new Error('No users found')
          return usersObjRes
        })
        .define(() =>
          resolve({ url: 'https://api.com/users', method: 'get' }).then(
            (res) => res.json() as Promise<{ users: User[] }>
          )
        ),
      a.request('withInstance').define(() => i.resolve({ url: '/users', method: 'get' }) as Promise<{ users: User[] }>),
      a
        .request('withInstanceOutput')
        .output(async (usersObj: Promise<{ users: User[] }>) => {
          const usersObjRes = await usersObj
          if (!usersObjRes.users) throw new Error('No users found')
          return usersObjRes
        })
        .define(() => i.resolve({ url: '/users', method: 'get' }) as Promise<{ users: User[] }>),
    ],
  })
  expect(r.get('https://api.com/users')).resolves.toEqual({ users })
  expectTypeOf(r.get('https://api.com/users')).resolves.toEqualTypeOf<{ users: User[] }>()
  expect(r.get('withOutput')).resolves.toEqual({ users })
  expectTypeOf(r.get('withOutput')).resolves.toEqualTypeOf<{ users: User[] }>()
  expect(r.get('withInstance')).resolves.toEqual({ users })
  expectTypeOf(r.get('withInstance')).resolves.toEqualTypeOf<{ users: User[] }>()
  expect(r.get('withInstanceOutput')).resolves.toEqual({ users })
  expectTypeOf(r.get('withInstanceOutput')).resolves.toEqualTypeOf<{ users: User[] }>()
})
