import { api } from '@hulla/api'
import { query } from '@hulla/api/integration-query'
import { describe, expect, test } from 'bun:test'

const users = [
  { id: 1, name: 'John' },
  { id: 2, name: 'Jane' },
]

const routes = [
  api.procedure('all', () => users),
  api.procedure('byId', (id: number) => users.find((u) => u.id === id)),
  api.request('a', 'GET', () => 'aa'),
] as const

const router = api.router('users', ...routes)
const usersAPI = api.create(router, { query })

describe('main functionality', () => {
  test('query has correct format', () => {
    expect(usersAPI.query('call', 'byId', 1)).toStrictEqual({
      queryKey: ['call/users/byId', 1],
      queryFn: expect.any(Function),
    })
    expect(usersAPI.query('call', 'all')).toStrictEqual({
      queryKey: ['call/users/all'],
      queryFn: expect.any(Function),
    })
  })
  test('queryFn executes correctly (does not mutate procedures/requests)', () => {
    const all = usersAPI.query('call', 'all')
    const byId = usersAPI.query('call', 'byId', 1)
    expect(all.queryFn()).toStrictEqual(users)
    expect(byId.queryFn()).toStrictEqual(users[0])
  })
})
