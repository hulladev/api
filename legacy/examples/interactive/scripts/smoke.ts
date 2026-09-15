import { QueryClient } from '@tanstack/query-core'
import { app } from '../apps/backend/src/index'
import { createClient } from '../apps/web/src/api/generated'

const client = createClient({
  baseUrl: 'http://interactive.test',
  fetch: (input, init) => app.fetch(new Request(input, init)),
  queryClient: new QueryClient(),
})

const listOptions = client.tasks.list.$tanstack.queryOptions()
const before = await listOptions.queryFn()
const created = await client.tasks.create({ title: 'Generated client smoke', priority: 'medium' })
const completed = await client.tasks.update(created.id, { completed: true })
if (!completed.completed) throw new Error('Generated positional update failed.')

const collection = client.tasks.$tanstack.collection
if (collection !== client.tasks.$tanstack.collection)
  throw new Error('Generated collection runtime did not retain its instance.')
await collection.preload()

const local = await collection.create({ title: 'Collection smoke', priority: 'low' })
const updated = collection.update(local.id, (draft) => {
  draft.completed = true
})
await updated.isPersisted.promise
if (!collection.get(local.id)?.completed) throw new Error('TanStack DB optimistic update failed.')

await collection.delete(local.id).isPersisted.promise
await client.tasks.delete(created.id)
const after = await client.tasks.list()
if (before.length !== after.length) throw new Error('Smoke test did not restore the seeded task count.')
client.$dispose()

console.log(
  'Smoke passed: plain HTTP, generated calls, query helpers, CRUD routes, and TanStack DB share one contract.'
)
