import { api } from '@hulla/api'
import { describe, expect, test } from 'bun:test'
import { expectTypeOf } from 'expect-type'
import { query } from '../src/query'

const users = [
  { id: 1, name: 'John' },
  { id: 2, name: 'Jane' },
]

export const router = api.router({
  name: 'users',
  routes: [
    api.procedure('all', () => users),
    api.procedure('byId', (id: number) => users.find((u) => u.id === id)!),
    api.request.get('a', () => 'aa'),
  ],
})
const usersAPI = api.create(router, { query })

describe('main functionality', () => {
  test('query has correct format', () => {
    expect(usersAPI.query.call('byId', 1)).toStrictEqual({
      queryKey: ['call/users/byId', 1],
      queryFn: expect.any(Function),
    })
    expect(usersAPI.query.call('all')).toStrictEqual({
      queryKey: ['call/users/all'],
      queryFn: expect.any(Function),
    })
  })
  test('queryFn executes correctly (does not mutate procedures/requests)', () => {
    const all = usersAPI.query.call('all')
    const byId = usersAPI.query.call('byId', 1)
    expect(all.queryFn()).toStrictEqual(users)
    expect(byId.queryFn()).toStrictEqual(users[0])
  })
  test('query has access to correct methods', () => {
    // these break typescript with expectTypeOf (even tho they are correct), and matching functions does not work
    // test('query has access to correct methods', () => {
    //   expect(usersAPI.query.call).toStrictEqual(
    //     <N extends RouteNamesWithMethod<typeof routes, 'call'>, A extends RouteArgs<typeof routes, 'call', N>>(
    //       route: N,
    //       ...args: A
    //     ) => ({ queryKey: [`call/users/${route}`, ...args], queryFn: () => router.invoke('call', route, args) })
    //   )
    //   expect(usersAPI.query.get).toStrictEqual(
    //     <N extends RouteNamesWithMethod<typeof routes, 'get'>, A extends RouteArgs<typeof routes, 'get', N>>(
    //       route: N,
    //       ...args: A
    //     ) => ({ queryKey: [`get/users/${route}`, ...args], queryFn: () => router.invoke('get', route, args) })
    //   )
    expect(usersAPI.query.call).toBeDefined()
    expect(usersAPI.query.get).toBeDefined()
    // @ts-expect-error accessing non-existent method
    expect(usersAPI.query.post).toBeUndefined()
  })
})

describe('type checks', () => {
  test('request has correct type', () => {
    expectTypeOf(usersAPI.query.get('a')).toEqualTypeOf<{
      queryKey: readonly ['get/users/a']
      queryFn: () => Promise<Response>
    }>()
  })
  test('no args has correct type and queryKey', () => {
    expectTypeOf(usersAPI.query.call('all')).toEqualTypeOf<{
      queryKey: readonly ['call/users/all']
      queryFn: () => { id: number; name: string }[]
    }>()
  })
  test('with args has correct type and queryKey', () => {
    expectTypeOf(usersAPI.query.call('byId', 2)).toEqualTypeOf<{
      queryKey: readonly ['call/users/byId', number]
      queryFn: () => { id: number; name: string }
    }>()
  })
})
