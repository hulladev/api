import { api } from '@hulla/api'
import { describe, expect, expectTypeOf, test } from 'vitest'
import { mutation } from '../src/mutation'

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
    mutation,
  },
})

// Since mutation is implemented by the same function as query, there's no point writing
// separate functional tests for it. The only thing worth checking is wether the returned
// object has been correctly changed from query to mutation

describe('type checks', () => {
  test('request has correct type', () => {
    expectTypeOf(usersAPI.mutation.get('byId', 2)).toEqualTypeOf<{
      mutationKey: readonly ['get/users/byId', 2]
      mutationFn: () => Promise<{ id: number; name: string }>
    }>()
  })
  test('no args has correct type and queryKey', () => {
    expectTypeOf(usersAPI.mutation.call('all')).toEqualTypeOf<{
      mutationKey: readonly ['call/users/all']
      mutationFn: () => typeof users
    }>()
  })
  test('mutation has access to correct methods', () => {
    expect(usersAPI.mutation.call).toBeDefined()
    expect(usersAPI.mutation.call).toBeDefined()
    // @ts-expect-error accessing non-existent method
    expect(usersAPI.mutation.post).toBeUndefined()
  })
})
