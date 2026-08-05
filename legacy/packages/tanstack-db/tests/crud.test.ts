import { createCollection } from '@tanstack/db'
import { QueryClient } from '@tanstack/query-core'
import { describe, expect, expectTypeOf, test } from 'vitest'
import { crudCollectionOptions } from '../src'

type Todo = {
  id: number
  title: string
  completed: boolean
  archivedAt: Date | null
}

function procedure<Args extends readonly unknown[], Result>(root: string, invoke: (...args: Args) => Result) {
  return Object.assign(invoke, { $key: { root } })
}

describe('CRUD collection options', () => {
  test('turns generated-style CRUD routes into collection persistence handlers', async () => {
    const calls: Array<[string, unknown]> = []
    const rows: Todo[] = [{ id: 1, title: 'one', completed: false, archivedAt: null }]
    const routes = {
      list: procedure('todos/list', async () => rows),
      create: procedure('todos/create', async (input: { id: number; title: string; completed: boolean }) => {
        calls.push(['create', input])
        return rows[0]!
      }),
      update: procedure('todos/update', async (id: number, patch: { title?: string; completed?: boolean }) => {
        calls.push(['update', [id, patch]])
        return rows[0]!
      }),
      delete: procedure('todos/delete', async (input: number) => {
        calls.push(['delete', input])
        return rows[0]!
      }),
    }

    const options = crudCollectionOptions({
      routes,
      key: 'id',
      queryClient: new QueryClient(),
      mapInsert: ({ modified }) => ({
        id: modified.id,
        title: modified.title,
        completed: modified.completed,
      }),
      refetch: false,
    })
    const collection = createCollection(options)

    expectTypeOf(collection.toArray).toMatchTypeOf<Todo[]>()
    expectTypeOf(options.create).parameter(0).toEqualTypeOf<{
      id: number
      title: string
      completed: boolean
    }>()

    await collection.preload()
    await options.create({ id: 3, title: 'three', completed: false })

    await options.onInsert!({
      transaction: { mutations: [{ modified: { id: 2, title: 'two', completed: false, archivedAt: null } }] },
    } as never)
    await options.onUpdate!({
      transaction: { mutations: [{ key: 2, changes: { completed: true } }] },
    } as never)
    await options.onDelete!({ transaction: { mutations: [{ key: 2 }] } } as never)

    expect(calls).toEqual([
      ['create', { id: 3, title: 'three', completed: false }],
      ['create', { id: 2, title: 'two', completed: false }],
      ['update', [2, { completed: true }]],
      ['delete', 2],
    ])
  })

  test('requires a scalar item key', () => {
    const routes = {
      list: procedure('todos/list', () => [{ id: 1, tags: ['one'] }]),
      create: procedure('todos/create', (input: { id: number }) => input),
      update: procedure('todos/update', (input: { id: number }) => input),
      delete: procedure('todos/delete', (input: number) => input),
    }

    const invalid = () =>
      crudCollectionOptions({
        routes,
        // @ts-expect-error TanStack DB keys must be strings or numbers
        key: 'tags',
        queryClient: new QueryClient(),
      })
    void invalid
  })
})
