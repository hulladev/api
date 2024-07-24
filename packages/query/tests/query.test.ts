import { api } from '@hulla/api'
import { describe, expect, expectTypeOf, test } from 'vitest'
import { query } from '../src/query'

const a = api()

const users = [
  { id: 1, name: 'John' },
  { id: 2, name: 'Jane' },
] as const

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
    query,
  },
})

describe('main functionality', () => {
  test('query has correct format', () => {
    expect(usersAPI.query.get('byId', 1)).toStrictEqual({
      queryKey: ['get/users/byId', 1],
      queryFn: expect.any(Function),
    })
    expect(usersAPI.query.call('all')).toStrictEqual({
      queryKey: ['call/users/all'],
      queryFn: expect.any(Function),
    })
  })
  test('queryFn executes correctly (does not mutate result)', () => {
    const all = usersAPI.query.call('all')
    const byId = usersAPI.query.get('byId', 1)
    expect(all.queryFn()).toStrictEqual(users)
    expect(byId.queryFn()).resolves.toStrictEqual(users[0])
  })
  test('query has access to correct methods', () => {
    expect(usersAPI.query.call).toBeDefined()
    expect(usersAPI.query.get).toBeDefined()
    // @ts-expect-error accessing non-existent method
    expect(usersAPI.query.post).toBeUndefined()
  })
})

describe('types are correct', () => {
  test('query has correct type', () => {
    expectTypeOf(usersAPI.query.get('byId', 1)).toEqualTypeOf<{
      queryKey: readonly ['get/users/byId', 1]
      queryFn: () => Promise<{ id: number; name: string }>
    }>()
  })
  test('query has correct type and queryKey', () => {
    expectTypeOf(usersAPI.query.call('all')).toEqualTypeOf<{
      queryKey: readonly ['call/users/all']
      queryFn: () => typeof users
    }>()
  })
})
