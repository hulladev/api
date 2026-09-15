import { mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs'
import { dirname, join } from 'node:path'
import type { APIPlugin } from '@hulla/api'
import { afterEach, describe, expect, test } from 'vitest'
import { fromDrizzle } from '../src/config'

const temporary: string[] = []

function tanstackDbPlugin(options?: unknown): APIPlugin {
  return {
    id: 'tanstackDb',
    generation: {
      from: '@hulla/api-tanstack-db',
      name: 'tanstackDbPlugin',
      options,
    },
  }
}

afterEach(() => {
  for (const path of temporary.splice(0)) rmSync(path, { recursive: true, force: true })
})

function write(root: string, path: string, content: string) {
  const target = join(root, path)
  mkdirSync(dirname(target), { recursive: true })
  writeFileSync(target, content)
}

describe('fromDrizzle', () => {
  test('discovers api-folder tables and generates HTTP router/client artifacts', async () => {
    const cwd = mkdtempSync(join(__dirname, '.tmp-'))
    temporary.push(cwd)
    write(cwd, 'drizzle.config.ts', "export default { dialect: 'sqlite', schema: './src/db/schema/**/*.ts' }\n")
    write(
      cwd,
      'src/db/schema/api/todos.ts',
      [
        "import { integer, sqliteTable, text } from 'drizzle-orm/sqlite-core'",
        "export const todosTable = sqliteTable('todos', { id: integer('id').primaryKey(), title: text('title').notNull() })",
        '',
      ].join('\n')
    )
    write(
      cwd,
      'src/db/schema/internal/secrets.ts',
      "import { sqliteTable, text } from 'drizzle-orm/sqlite-core'\nexport const secretsTable = sqliteTable('secrets', { id: text('id').primaryKey() })\n"
    )
    const sourceDir = join(cwd, 'generated/sources/database')
    const result = await fromDrizzle({
      name: 'database',
      routes: 'all',
      plugins: [tanstackDbPlugin()],
    }).generate({
      cwd,
      configPath: join(cwd, 'api.config.ts'),
      outDir: join(cwd, 'generated'),
      sourceDir,
      sources: [],
    })
    const server = readFileSync(result.outputs!['server']!, 'utf8')
    const client = readFileSync(result.outputs!['client']!, 'utf8')
    const contract = JSON.parse(readFileSync(result.outputs!['manifest']!, 'utf8'))

    expect(result.transport).toBe('http')
    expect(server).toContain('export function createDrizzleRouters')
    expect(server).toContain("import type { DrizzleRouterAPI } from '@hulla/api-drizzle'")
    expect(server).toContain('options: { api: DrizzleRouterAPI }')
    expect(server).not.toContain('api: any')
    expect(server).toContain('define(crud(todosTable))')
    expect(server).not.toContain('secretsTable')
    expect(client).toContain('clientSchema')
    expect(client).toContain("import type { HTTPWireInput, HTTPWireOutput } from '@hulla/api'")
    expect(client).toContain('type Router1Procedure1Output = HTTPWireOutput<')
    expect(client).not.toContain('CrudRoutesFor')
    expect(client).not.toContain('Model1')
    expect(client).not.toContain('src/db/schema')
    expect(client).toContain('transport.call<Router1Procedure1Output>(httpContract.routes["todos"]["list"])')
    expect(client).toContain(
      'transport.request<Router1Procedure1Output>(httpContract.routes["todos"]["list"], options)'
    )
    expect(client).toContain('.input(clientSchema<Router1Procedure4Input1>(), clientSchema<Router1Procedure4Input2>())')
    expect(client).toContain('httpContract.routes["todos"]["update"], ...input)')
    expect(client).not.toContain("from 'zod'")
    expect(contract).toMatchObject({
      version: 1,
      basePath: '/api',
      routes: {
        todos: {
          get: { input: { kind: 'value', wire: { kind: 'number' } } },
          update: { input: { kind: 'tuple', items: [{ kind: 'number' }, { kind: 'object' }] } },
        },
      },
    })
    expect(result.contract).toEqual({
      importPath: './sources/database/contract',
      exportName: 'httpContract',
    })
    expect(result.collections).toEqual([{ router: 'todos', key: 'id' }])
  })

  test('can disable inferred TanStack DB collections', async () => {
    const cwd = mkdtempSync(join(__dirname, '.tmp-'))
    temporary.push(cwd)
    write(cwd, 'drizzle.config.ts', "export default { dialect: 'sqlite', schema: './src/db/schema.ts' }\n")
    write(
      cwd,
      'src/db/schema.ts',
      "import { integer, sqliteTable } from 'drizzle-orm/sqlite-core'\nexport const todos = sqliteTable('todos', { id: integer('id').primaryKey() })\n"
    )
    const result = await fromDrizzle({
      routes: 'all',
      expose: './src/db/schema.ts',
      plugins: [tanstackDbPlugin({ collections: false })],
    }).generate({
      cwd,
      configPath: join(cwd, 'api.config.ts'),
      outDir: join(cwd, 'generated'),
      sourceDir: join(cwd, 'generated/sources/drizzle'),
      sources: [],
    })

    expect(result.collections).toBeUndefined()
  })

  test('requires explicit bulk route exposure', async () => {
    expect(() => (fromDrizzle as unknown as () => ReturnType<typeof fromDrizzle>)()).toThrow("routes: 'all'")
  })
})
