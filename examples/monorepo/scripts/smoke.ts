import { createClient } from '@fitness/api-client'
import { QueryClient } from '@tanstack/query-core'
import { app } from '../apps/backend/src/index'

const client = createClient({
  baseUrl: 'http://fitness.test',
  fetch: (input, init) => app.fetch(new Request(input, init)),
  queryClient: new QueryClient(),
})

const before = await client.workouts.list()
const created = await client.workouts.create({
  name: 'CLI smoke test',
  focus: 'Recovery',
})
const completed = await client.workouts.update(created.id, {
  completed: true,
})
const fetched = await client.workouts.get(created.id)
await client.workouts.delete(created.id)
const after = await client.workouts.list()

if (!completed.completed || !fetched.completed || before.length !== after.length) {
  throw new Error('Generated client CRUD smoke test failed.')
}

const workouts = client.workouts.$tanstack.collection
if (workouts !== client.workouts.$tanstack.collection)
  throw new Error('Generated collection runtime did not retain its instance.')
await workouts.preload()
const collectionStart = workouts.toArray.length
await workouts.create({
  name: 'TanStack DB smoke test',
  focus: 'Mobility',
})

const persisted = workouts.toArray.find((workout) => workout.name === 'TanStack DB smoke test')
if (!persisted) throw new Error('TanStack DB insert did not sync from the generated CRUD route.')

const updated = workouts.update(persisted.id, (draft) => {
  draft.completed = true
})
await updated.isPersisted.promise
if (!workouts.get(persisted.id)?.completed) throw new Error('TanStack DB update did not persist.')

const deleted = workouts.delete(persisted.id)
await deleted.isPersisted.promise
if (workouts.toArray.length !== collectionStart) throw new Error('TanStack DB delete did not persist.')
client.$dispose()

console.log(`Smoke passed: ${before.length} seeded workouts, generated CRUD and TanStack DB are live.`)
