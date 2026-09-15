import assert from 'node:assert/strict'
import { createUserClient, type User } from './client'

const users = new Map<string, User>([['user_1', { id: 'user_1', name: 'Ada' }]])

const client = createUserClient({
  async list() {
    return [...users.values()]
  },
  async get(id) {
    return users.get(id) ?? null
  },
  async create(input) {
    const user = { id: `user_${users.size + 1}`, ...input }
    users.set(user.id, user)
    return user
  },
})

const listQuery = client.list.$tanstack.queryOptions()
assert.deepEqual(listQuery.queryKey, ['users/list'])
assert.deepEqual(await listQuery.queryFn(), [{ id: 'user_1', name: 'Ada' }])

const [userKey, loadUser] = client.byId.$swr.queryOptions('user_1')
assert.deepEqual(userKey, ['users/byId', 'user_1'])
assert.deepEqual(await loadUser(), { id: 'user_1', name: 'Ada' })

const createMutation = client.create.$tanstack.mutationOptions()
assert.deepEqual(await createMutation.mutationFn({ name: 'Grace' }), {
  id: 'user_2',
  name: 'Grace',
})

console.log('Client-only smoke passed: procedures, TanStack Query, and SWR are wired.')
