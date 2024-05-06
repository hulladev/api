import { api } from '@hulla/api'
import { describe, expect, test } from 'bun:test'
import { mutation } from '../src/mutation'

const users = [
  { id: 1, name: 'John' },
  { id: 2, name: 'Jane' },
]

const routes = [
  api.procedure('all', () => users),
  api.procedure('byId', async (id: number) => users.find((u) => u.id === id)),
  api.request('getter', 'GET', () => 'aa'),
] as const

const router = api.router('users', ...routes)
const usersAPI = api.create(router, { mutation })

describe('main functionality', () => {
  test('query has correct format', () => {
    expect(usersAPI.mutation('call', 'byId', 1)).toStrictEqual({
      mutationKey: ['call/users/byId', 1],
      mutationFn: expect.any(Function),
    })
    expect(usersAPI.mutation('call', 'all')).toStrictEqual({
      mutationKey: ['call/users/all'],
      mutationFn: expect.any(Function),
    })
  })
  test('queryFn executes correctly (does not mutate procedures/requests)', () => {
    const all = usersAPI.mutation('call', 'all')
    const byId = usersAPI.mutation('call', 'byId', 1)
    expect(all.mutationFn()).toStrictEqual(users)
    expect(byId.mutationFn()).resolves.toStrictEqual(users[0])
  })
})
