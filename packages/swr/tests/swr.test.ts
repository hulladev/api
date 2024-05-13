import { api as init, type Call } from '@hulla/api'
import { expectTypeOf } from 'expect-type'
import { describe, expect, test } from 'vitest'
import { swr } from '../src/swr'

const users = [
  { id: 1, name: 'John' },
  { id: 2, name: 'Jane' },
]

const api = init()

export const router = api.router({
  name: 'users',
  routes: [
    api.procedure('all', () => users),
    api.procedure('byId', (id: number) => users.find((u) => u.id === id)!),
    { method: 'get', route: 'a', fn: () => new Promise((res) => res) } as Call<
      'a',
      'get',
      Record<string, never>,
      [],
      Promise<Response>
    >,
  ],
})
const usersAPI = api.create(router, { swr })

describe('main functionality', () => {
  test('query has correct format', () => {
    expect(usersAPI.swr.call('byId', 1)).toStrictEqual([['call/users/byId', 1], expect.any(Function)])
    expect(usersAPI.swr.call('all')).toStrictEqual([['call/users/all'], expect.any(Function)])
  })
  test('queryFn executes correctly (does not mutate procedures/requests)', () => {
    const [allKey, all] = usersAPI.swr.call('all')
    const [byIdKey, byId] = usersAPI.swr.call('byId', 1)
    expect(all()).toStrictEqual(users)
    expect(byId()).toStrictEqual(users[0])
    expect(allKey).toStrictEqual(['call/users/all'])
    expect(byIdKey).toStrictEqual(['call/users/byId', 1])
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
    expect(usersAPI.swr.call).toBeDefined()
    expect(usersAPI.swr.get).toBeDefined()
    // @ts-expect-error accessing non-existent method
    expect(usersAPI.swr.post).toBeUndefined()
  })
})

describe('type checks', () => {
  test('request has correct type', () => {
    expectTypeOf(usersAPI.swr.get('a')).toEqualTypeOf<readonly [['get/users/a'], () => Promise<Response>]>()
  })
  test('no args has correct type and queryKey', () => {
    expectTypeOf(usersAPI.swr.call('all')).toEqualTypeOf<
      readonly [['call/users/all'], () => { id: number; name: string }[]]
    >()
  })
  test('with args has correct type and queryKey', () => {
    expectTypeOf(usersAPI.swr.call('byId', 2)).toEqualTypeOf<
      readonly [['call/users/byId', number], () => { id: number; name: string }]
    >()
  })
})
