import { api } from '@hulla/api'
import { expectTypeOf } from 'expect-type'
import { describe, expect, test } from 'vitest'
import { mutation } from '../src/mutation'
import { swr } from '../src/swr'

export const users = [
  { id: 1, name: 'John' },
  { id: 2, name: 'Jane' },
] as const

const a = api()

export const usersAPI = a.router({
  name: 'users',
  routes: [
    a.procedure('all').define(() => users),
    a
      .procedure('byId', 'get')
      .input((id: number) => users.find((u) => u.id === id)!)
      .define(({ input }): Promise<{ id: number; name: string }> => new Promise((res) => res(input))),
  ],
  adapters: {
    swr,
    mutation,
  },
})

describe('main functionality', () => {
  test('swr has correct format', () => {
    expect(usersAPI.swr.get('byId', 1)).toStrictEqual([['get/users/byId', 1], expect.any(Function)])
    expect(usersAPI.swr.call('all')).toStrictEqual([['call/users/all'], expect.any(Function)])
  })
  test('queryFn executes correctly (does not mutate procedures/requests)', () => {
    const [allKey, all] = usersAPI.swr.call('all')
    const [byIdKey, byId] = usersAPI.swr.get('byId', 1)
    expect(all()).toStrictEqual(users)
    expect(byId()).resolves.toStrictEqual(users[0])
    expect(allKey).toStrictEqual(['call/users/all'])
    expect(byIdKey).toStrictEqual(['get/users/byId', 1])
  })
  test('query has access to correct methods', () => {
    expect(usersAPI.swr.call).toBeDefined()
    expect(usersAPI.swr.get).toBeDefined()
    // @ts-expect-error accessing non-existent method
    expect(usersAPI.swr.post).toBeUndefined()
  })
})

describe('type checks', () => {
  test('no args has correct type and queryKey', () => {
    expectTypeOf(usersAPI.swr.call('all')).toEqualTypeOf<readonly [['call/users/all'], () => typeof users]>()
  })
  test('with args has correct type and queryKey', () => {
    expectTypeOf(usersAPI.swr.get('byId', 2)).toEqualTypeOf<
      readonly [['get/users/byId', 2], () => Promise<{ id: number; name: string }>]
    >()
  })
})
