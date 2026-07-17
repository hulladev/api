import { createCollection } from '@tanstack/db'
import { QueryClient } from '@tanstack/query-core'
import { describe, expect, expectTypeOf, test } from 'vitest'
import { createApi } from '../../core/src'
import { tanstackDbPlugin } from '../src'

describe('TanStack DB plugin', () => {
  test('builds query collection options from an array procedure', async () => {
    const rows = [
      { id: 1, title: 'one' },
      { id: 2, title: 'two' },
    ]
    const routes = createApi({ plugins: [tanstackDbPlugin()] })
      .router('todos')
      .define(({ procedure }) => ({ list: procedure.handler(async () => rows) }))

    const options = routes.list.$tanstack.collectionOptions({
      queryClient: new QueryClient(),
      getKey: (todo) => todo.id,
    })
    const collection = createCollection(options)

    expectTypeOf(collection.toArray).toMatchTypeOf<Array<{ id: number; title: string }>>()
    await collection.preload()
    expect(collection.toArray.map(({ id, title }) => ({ id, title }))).toEqual(rows)
  })

  test('shares the tanstack namespace with the query plugin contract', () => {
    const routes = createApi({ plugins: [tanstackDbPlugin({ namespace: 'db' })] })
      .router('todos')
      .define(({ procedure }) => ({ list: procedure.handler(() => [{ id: 1 }]) }))

    expect(routes.list.$db.collectionOptions).toBeTypeOf('function')
  })

  test('carries generated collection configuration in plugin metadata', () => {
    const plugin = tanstackDbPlugin({ collections: { todos: 'id' } })

    expect(plugin.generation).toMatchObject({
      from: '@hulla/api-tanstack-db',
      name: 'tanstackDbPlugin',
      options: { collections: { todos: 'id' } },
    })
  })
})
