import { createApi } from '@hulla/api'
import { integer, SQLiteSyncDialect, sqliteTable, text } from 'drizzle-orm/sqlite-core'
import { describe, expect, expectTypeOf, test } from 'vitest'
import { crud, defineTable, drizzlePlugin, type DefinedTable } from '../src'

const todosTable = sqliteTable('todos', {
  id: integer('id').primaryKey(),
  title: text('title').notNull(),
  archivedAt: integer('archived_at', { mode: 'timestamp' }),
})

const booleanArchiveTable = sqliteTable('boolean_archive', {
  id: integer('id').primaryKey(),
  archived: integer('archived', { mode: 'boolean' }),
})

function database(rows: Array<{ id: number; title: string; archivedAt: Date | null }> = []) {
  return {
    select: () => ({
      from: () => Object.assign(Promise.resolve(rows), { where: () => Promise.resolve(rows) }),
    }),
    insert: () => ({
      values: (value: any) => ({ returning: () => Promise.resolve([{ archivedAt: null, ...value }]) }),
    }),
    update: () => ({
      set: (value: any) => ({
        where: () => ({ returning: () => Promise.resolve([{ id: 1, title: 'updated', archivedAt: null, ...value }]) }),
      }),
    }),
    delete: () => ({
      where: () => ({ returning: () => Promise.resolve(rows.slice(0, 1)) }),
    }),
  }
}

describe('Drizzle CRUD presets', () => {
  test('carries the selected primary key into generation metadata', () => {
    expect(crud(todosTable).$hulla.generation).toEqual({ collection: { key: 'id' } })
    expect(
      crud(todosTable, {
        select: { todoId: todosTable.id, title: todosTable.title },
      }).$hulla.generation
    ).toEqual({ collection: { key: 'todoId' } })
    expect(
      crud(todosTable, {
        select: { title: todosTable.title },
      }).$hulla.generation
    ).toBeUndefined()
  })

  test('defines reusable typed table schemas and archive metadata', () => {
    const todos = defineTable(todosTable, { archive: 'archivedAt' })
    expectTypeOf(todos).toEqualTypeOf<DefinedTable<typeof todosTable, 'archivedAt'>>()
    expect(todos.archive).toBe('archivedAt')
    expect(todos.schemas.insert.parse({ id: 1, title: 'one' })).toEqual({ id: 1, title: 'one' })
    expect(() => todos.schemas.insert.parse({ id: 1 })).toThrow()
    expect(() =>
      // @ts-expect-error string columns cannot be archive markers
      defineTable(todosTable, { archive: 'title' })
    ).toThrow('must be boolean or a nullable date')
  })

  test('creates ordinary core routes and inherits router middleware', async () => {
    const db = database([{ id: 1, title: 'one', archivedAt: null }])
    const api = createApi({
      middleware: { session: () => ({ userId: 'u1' as const }) },
      plugins: [drizzlePlugin({ db })],
    })
    const routes = api.router('todos').use('session').define(crud(todosTable))

    expectTypeOf<Awaited<ReturnType<typeof routes.get>>>().toEqualTypeOf<{
      id: number
      title: string
      archivedAt: Date | null
    } | null>()
    await expect(routes.list()).resolves.toEqual([{ id: 1, title: 'one', archivedAt: null }])
    await expect(routes.get(1)).resolves.toEqual({ id: 1, title: 'one', archivedAt: null })
    expect(routes.list.$meta.route).toEqual({ method: 'GET', path: '/' })
    expect(routes.delete.$meta.route).toEqual({ method: 'DELETE', path: '/:id' })
  })

  test('uses Drizzle selections only for returned values', async () => {
    const db = database([{ id: 1, title: 'one', archivedAt: null }])
    const api = createApi({ plugins: [drizzlePlugin({ db })] })
    const routes = api.router('todos').define(
      crud(todosTable, {
        select: { id: todosTable.id, title: todosTable.title },
      })
    )

    await expect(routes.create({ id: 2, title: 'two' })).resolves.toMatchObject({ id: 2, title: 'two' })
    expect(() => routes.create({ id: 2 } as never)).toThrow()
  })

  test('excludes archive markers from generated write inputs', () => {
    const todos = defineTable(todosTable, { archive: 'archivedAt' })
    const api = createApi({ plugins: [drizzlePlugin({ db: database() })] })
    const routes = api.router('todos').define(crud(todos))

    const checkWriteTypes = () => {
      // @ts-expect-error archive markers are controlled by delete/restore
      void routes.create({ id: 1, title: 'one', archivedAt: null })
      // @ts-expect-error archive markers are controlled by delete/restore
      void routes.update(1, { archivedAt: null })
    }
    void checkWriteTypes
  })

  test('treats false and null nullable boolean archive markers as active', async () => {
    let where: unknown
    const db = {
      select: () => ({
        from: () => ({
          where: (condition: unknown) => {
            where = condition
            return Promise.resolve([{ id: 1, archived: null }])
          },
        }),
      }),
    }
    const api = createApi({ plugins: [drizzlePlugin({ db })] })
    const routes = api.router('records').define(crud(defineTable(booleanArchiveTable, { archive: 'archived' })))

    await expect(routes.get(1)).resolves.toEqual({ id: 1, archived: null })
    const query = new SQLiteSyncDialect().sqlToQuery(where as never).sql.toLowerCase()
    expect(query).toContain('archived')
    expect(query).toContain('or')
    expect(query).toContain('is null')
  })

  test('rejects empty update patches before invoking the database', () => {
    let updateCalls = 0
    const base = database()
    const db = {
      ...base,
      update: () => {
        updateCalls += 1
        return base.update()
      },
    }
    const api = createApi({ plugins: [drizzlePlugin({ db })] })
    const routes = api.router('todos').define(crud(todosTable))

    expect(() => routes.update(1, {})).toThrow('at least one field')
    expect(updateCalls).toBe(0)
  })

  test('supports route mapping overrides and preset customization', () => {
    const api = createApi({ plugins: [drizzlePlugin({ db: database() })] })
    const routes = api.router('todos').define(
      crud(todosTable, {
        routes: {
          list: { method: 'QUERY', path: '/search' },
          delete: false,
          restore: false,
        },
      }),
      ({ generated, route }) => ({
        ...generated,
        health: route('GET', '/health').handler(() => ({ ok: true })),
      })
    )

    expect(routes.list.$meta.route).toEqual({ method: 'QUERY', path: '/search' })
    expect(routes).not.toHaveProperty('delete')
    expect(routes.health()).toEqual({ ok: true })
  })

  test('fails clearly when the server plugin is missing', () => {
    const api = createApi()
    // @ts-expect-error crud() requires the drizzle plugin on the API instance
    expect(() => api.router('todos').define(crud(todosTable))).toThrow('requires drizzlePlugin')
  })
})
