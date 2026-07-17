import { definePlugin, defineRouterPreset } from '@hulla/api'
import type { HTTPRoute, Schema } from '@hulla/api'
import type { APIPlugin, RouterPreset, RouterPresetBuilderContext, RouterPresetRoutes } from '@hulla/api/plugin'
import { and, eq, getTableColumns, isNull, or } from 'drizzle-orm'
import type { Column, GetColumnData, InferInsertModel, InferSelectModel, SQL, Table } from 'drizzle-orm'

type TableColumns<T extends Table> = T['_']['columns']
type ColumnName<T extends Table> = Extract<keyof TableColumns<T>, string>
type PrimaryKeyName<T extends Table> = {
  [K in ColumnName<T>]: TableColumns<T>[K]['_']['isPrimaryKey'] extends true ? K : never
}[ColumnName<T>]
type ArchiveColumnName<T extends Table> = {
  [K in ColumnName<T>]: GetColumnData<TableColumns<T>[K]> extends boolean | Date | null ? K : never
}[ColumnName<T>]
type SelectionValue<T> = T extends Column ? GetColumnData<T> : T extends SQL<infer V> ? V : never
type SelectionResult<S extends Record<string, unknown>> = { [K in keyof S]: SelectionValue<S[K]> }
type WritableInsert<T extends Table, A extends PropertyKey | undefined = undefined> = Omit<
  InferInsertModel<T>,
  Extract<A, PropertyKey>
>
type UpdateModel<T extends Table, A extends PropertyKey | undefined = undefined> = {
  [K in Exclude<keyof InferInsertModel<T>, PrimaryKeyName<T> | A>]?: InferInsertModel<T>[K] | undefined
}
type KeyInput<T extends Table> = GetColumnData<TableColumns<T>[PrimaryKeyName<T>]>
type PresetHandler<Args extends readonly unknown[], Result> = ((...args: Args) => Promise<Result>) & {
  $meta: { type: 'procedure'; input: Schema | undefined; output: Schema | undefined; route?: HTTPRoute }
}

type DrizzlePresetRoutes = Record<string, (...args: never[]) => unknown>

/** Minimal API capability required by generated Drizzle router factories. */
export type DrizzleRouterAPI = {
  router<const Name extends string>(
    name: Name
  ): {
    define<const Routes extends DrizzlePresetRoutes>(preset: RouterPreset<Routes, 'drizzle'>): Routes
  }
}
export type CrudGeneratedRoutes<
  T extends Table,
  Output = InferSelectModel<T>,
  A extends PropertyKey | undefined = undefined,
> = {
  list: PresetHandler<[], Output[]>
  get: PresetHandler<[input: KeyInput<T>], Output | null>
  create: PresetHandler<[input: WritableInsert<T, A>], Output>
  update: PresetHandler<[key: KeyInput<T>, patch: UpdateModel<T, A>], Output | null>
  delete: PresetHandler<[input: KeyInput<T>], Output | null>
} & (A extends PropertyKey ? { restore: PresetHandler<[input: KeyInput<T>], Output | null> } : {})
export type CrudRoutesFor<T> =
  T extends DefinedTable<infer TableType, infer Archive>
    ? CrudGeneratedRoutes<TableType, InferSelectModel<TableType>, Archive>
    : T extends Table
      ? CrudGeneratedRoutes<T>
      : never

type TableSchemas<T extends Table, A extends PropertyKey | undefined = undefined> = {
  select: Schema<unknown, InferSelectModel<T>>
  insert: Schema<unknown, WritableInsert<T, A>>
  update: Schema<unknown, UpdateModel<T, A>>
  key: Schema<unknown, GetColumnData<TableColumns<T>[PrimaryKeyName<T>]>>
}

export type DefineTableConfig<
  T extends Table,
  A extends ArchiveColumnName<T> | undefined = ArchiveColumnName<T> | undefined,
> = {
  readonly schemas?: Partial<TableSchemas<T, A>>
  readonly archive?: A
}

export type DefinedTable<T extends Table, A extends ArchiveColumnName<T> | undefined = undefined> = {
  readonly $hulla: { readonly kind: 'hulla.api-drizzle.table' }
  readonly table: T
  readonly schemas: TableSchemas<T, A>
  /** @internal Schema slots explicitly supplied by the user. */
  readonly 'hulla.api.schemaOverrides': readonly (keyof TableSchemas<T, A>)[]
  readonly archive?: A
}

export type DrizzlePlugin<DB = unknown> = APIPlugin<'drizzle', undefined, undefined, undefined, 'drizzle'> & {
  readonly target: 'server'
  readonly db: DB
}

export function drizzlePlugin<const DB>(options: { readonly db: DB }): DrizzlePlugin<DB> {
  if (options.db === undefined || options.db === null)
    throw new Error('drizzlePlugin({ db }) requires a database instance.')
  return definePlugin({
    id: 'drizzle',
    namespace: 'drizzle',
    target: 'server',
    db: options.db,
    defaults: { inject: 'always' },
  }) as DrizzlePlugin<DB>
}

export function defineTable<const T extends Table, const A extends ArchiveColumnName<T> | undefined = undefined>(
  table: T,
  config: DefineTableConfig<T, A> = {}
): DefinedTable<T, A> {
  const metadata = tableMetadata(table)
  if (config.archive !== undefined) assertArchiveColumn(metadata.columns, config.archive)
  const inferred = inferSchemas(metadata, config.archive)
  const schemas = Object.freeze({ ...inferred, ...config.schemas }) as TableSchemas<T, A>
  return Object.freeze({
    $hulla: { kind: 'hulla.api-drizzle.table' as const },
    table,
    schemas,
    'hulla.api.schemaOverrides': Object.keys(config.schemas ?? {}) as (keyof TableSchemas<T, A>)[],
    ...(config.archive === undefined ? {} : { archive: config.archive }),
  })
}

type CrudOperation = 'list' | 'get' | 'create' | 'update' | 'delete' | 'restore'
type CrudRouteOverrides = Partial<Record<CrudOperation, HTTPRoute | false>>

export type CrudOptions<T extends Table, S extends Record<string, unknown> = TableColumns<T>> = {
  readonly select?: S
  readonly output?: Schema<unknown, SelectionResult<S>>
  readonly routes?: CrudRouteOverrides
}

export function crud<
  const T extends Table,
  const S extends Record<string, unknown> = TableColumns<T>,
  const A extends ArchiveColumnName<T> | undefined = undefined,
>(
  table: T | DefinedTable<T, A>,
  options?: CrudOptions<T, S>
): RouterPreset<CrudGeneratedRoutes<T, SelectionResult<S>, A>, 'drizzle'>
export function crud(
  tableOrDefinition: Table | DefinedTable<Table, any>,
  options: CrudOptions<Table, Record<string, unknown>> = {}
): RouterPreset<Record<string, any>, 'drizzle'> {
  const definition = isDefinedTable(tableOrDefinition) ? tableOrDefinition : defineTable(tableOrDefinition)
  const metadata = tableMetadata(definition.table)
  const selection = options.select ?? metadata.columns
  const collectionKey = Object.entries(selection).find(
    ([, value]) => value === metadata.columns[metadata.primaryName]
  )?.[0]

  return defineRouterPreset(
    (builders: RouterPresetBuilderContext<'drizzle'>) => {
      const plugin = builders.$api.plugins.registry.drizzle as unknown as DrizzlePlugin | undefined
      if (!plugin) throw new Error('crud(table) requires drizzlePlugin({ db }) in createApi({ plugins }).')
      return createCrudRoutes(plugin.db as any, definition, options, builders)
    },
    {
      requires: 'drizzle',
      ...(collectionKey === undefined ? {} : { generation: { collection: { key: collectionKey } } }),
    }
  )
}

function createCrudRoutes(
  db: any,
  definition: DefinedTable<Table, any>,
  options: CrudOptions<Table, Record<string, unknown>>,
  builders: RouterPresetBuilderContext<'drizzle'>
): RouterPresetRoutes {
  const table = definition.table
  const metadata = tableMetadata(table)
  const primaryName = metadata.primaryName
  const primaryColumn = metadata.columns[primaryName]!
  const selection = options.select ?? metadata.columns
  const selectSchema = outputSchema(definition.schemas.select, selection, metadata.columns, options.output)
  const listOutput = arraySchema(selectSchema)
  const nullableOutput = nullableSchema(selectSchema)
  const insertSchema = protectedWriteSchema(definition.schemas.insert, definition.archive)
  const updateSchema = nonEmptyUpdateSchema(protectedWriteSchema(definition.schemas.update, definition.archive))
  const path = `/:${primaryName}`
  const active = archiveCondition(definition)
  const include = (operation: CrudOperation) => options.routes?.[operation] !== false
  const mapped = (operation: CrudOperation, method: HTTPRoute['method'], routePath: string) => {
    const route = options.routes?.[operation]
    const resolved = route === undefined || route === false ? { method, path: routePath } : route
    return builders.route(resolved.method, resolved.path)
  }
  const routes: RouterPresetRoutes = {}

  if (include('list')) {
    routes['list'] = mapped('list', 'GET', '/')
      .output(listOutput)
      .handler(async () => {
        const query = db.select(selection).from(table)
        return active ? query.where(active) : query
      })
  }
  if (include('get')) {
    routes['get'] = mapped('get', 'GET', path)
      .input(definition.schemas.key)
      .output(nullableOutput)
      .handler(async ({ input }: any) => {
        const condition = active ? and(eq(primaryColumn, input), active) : eq(primaryColumn, input)
        return (await db.select(selection).from(table).where(condition))[0] ?? null
      })
  }
  if (include('create')) {
    routes['create'] = mapped('create', 'POST', '/')
      .input(insertSchema)
      .output(selectSchema)
      .handler(async ({ input }: any) => (await db.insert(table).values(input).returning(selection))[0])
  }
  if (include('update')) {
    routes['update'] = mapped('update', 'PATCH', path)
      .input(definition.schemas.key, updateSchema)
      .output(nullableOutput)
      .handler(async ({ input }: any) => {
        const [key, patch] = input
        const condition = active ? and(eq(primaryColumn, key), active) : eq(primaryColumn, key)
        return (await db.update(table).set(patch).where(condition).returning(selection))[0] ?? null
      })
  }
  if (include('delete')) {
    routes['delete'] = mapped('delete', 'DELETE', path)
      .input(definition.schemas.key)
      .output(nullableOutput)
      .handler(async ({ input }: any) => {
        if (definition.archive) {
          const column = metadata.columns[definition.archive]!
          const value = String(column.dataType).split(' ')[0] === 'boolean' ? true : new Date()
          return (
            (
              await db
                .update(table)
                .set({ [definition.archive]: value })
                .where(and(eq(primaryColumn, input), active))
                .returning(selection)
            )[0] ?? null
          )
        }
        return (await db.delete(table).where(eq(primaryColumn, input)).returning(selection))[0] ?? null
      })
  }
  if (definition.archive && include('restore')) {
    routes['restore'] = mapped('restore', 'POST', `${path}/restore`)
      .input(definition.schemas.key)
      .output(nullableOutput)
      .handler(async ({ input }: any) => {
        const column = metadata.columns[definition.archive!]!
        const value = String(column.dataType).split(' ')[0] === 'boolean' ? false : null
        return (
          (
            await db
              .update(table)
              .set({ [definition.archive!]: value })
              .where(eq(primaryColumn, input))
              .returning(selection)
          )[0] ?? null
        )
      })
  }
  return routes
}

function isDefinedTable(value: unknown): value is DefinedTable<Table, any> {
  return (
    typeof value === 'object' &&
    value !== null &&
    (value as { $hulla?: { kind?: unknown } }).$hulla?.kind === 'hulla.api-drizzle.table'
  )
}

function tableMetadata(table: Table) {
  const columns = getTableColumns(table) as Record<string, any>
  const primary = Object.entries(columns).filter(([, column]) => column.primary === true)
  if (primary.length !== 1)
    throw new Error(`Drizzle CRUD requires exactly one primary-key column; found ${primary.length}.`)
  return { columns, primaryName: primary[0]![0] }
}

function inferSchemas(metadata: ReturnType<typeof tableMetadata>, archive?: string): TableSchemas<any> {
  const selectShape: Record<string, Schema> = {}
  const insertShape: Record<string, Schema> = {}
  const updateShape: Record<string, Schema> = {}
  for (const [name, column] of Object.entries(metadata.columns)) {
    let schema = columnSchema(column)
    if (!column.notNull) schema = nullableSchema(schema)
    selectShape[name] = schema
    if (name === archive) continue
    insertShape[name] = column.hasDefault || !column.notNull ? optionalSchema(schema) : schema
    if (name !== metadata.primaryName) updateShape[name] = optionalSchema(schema)
  }
  return {
    select: objectSchema(selectShape),
    insert: objectSchema(insertShape),
    update: objectSchema(updateShape),
    key: columnSchema(metadata.columns[metadata.primaryName]),
  } as unknown as TableSchemas<any>
}

function columnSchema(column: any): Schema {
  if (Array.isArray(column.enumValues) && column.enumValues.length > 0) {
    return valueSchema((value) => column.enumValues.includes(value), `one of ${column.enumValues.join(', ')}`)
  }
  const type = String(column.dataType ?? '').split(' ')[0]
  const columnType = String(column.columnType ?? '')
  if (type === 'number') return valueSchema((value) => typeof value === 'number', 'a number')
  if (type === 'boolean') return valueSchema((value) => typeof value === 'boolean', 'a boolean')
  if (type === 'bigint') return valueSchema((value) => typeof value === 'bigint', 'a bigint')
  if (type === 'date' || /date|time/i.test(columnType)) return valueSchema((value) => value instanceof Date, 'a Date')
  if (type === 'buffer' || /blob|bytea|buffer/i.test(columnType)) {
    return valueSchema((value) => value instanceof Uint8Array, 'a Uint8Array')
  }
  if (type === 'array') return valueSchema(Array.isArray, 'an array')
  if (type === 'json') return valueSchema((value) => value !== undefined, 'JSON')
  if (type === 'string') return valueSchema((value) => typeof value === 'string', 'a string')
  throw new Error(`Unsupported Drizzle column "${column.name ?? 'unknown'}" (${columnType}/${type}).`)
}

type PickableSchema = Schema & { pick(mask: Record<string, true>): PickableSchema }

function objectSchema(shape: Record<string, Schema>): PickableSchema {
  return {
    parse(value: unknown) {
      if (typeof value !== 'object' || value === null || Array.isArray(value)) throw new Error('Expected an object.')
      return Object.fromEntries(Object.entries(shape).map(([key, schema]) => [key, schema.parse((value as any)[key])]))
    },
    pick(mask) {
      return objectSchema(Object.fromEntries(Object.keys(mask).map((key) => [key, shape[key]!])))
    },
    _input: undefined as never,
    _output: undefined as never,
  }
}

function optionalSchema(schema: Schema): Schema {
  return {
    parse: (value) => (value === undefined ? undefined : schema.parse(value)),
    _input: undefined as never,
    _output: undefined as never,
  }
}

function valueSchema(check: (value: unknown) => boolean, expected: string): Schema {
  return {
    parse(value) {
      if (!check(value)) throw new Error(`Expected ${expected}.`)
      return value
    },
    _input: undefined as never,
    _output: undefined as never,
  }
}

function outputSchema(
  base: Schema,
  selection: Record<string, unknown>,
  columns: Record<string, unknown>,
  explicit?: Schema
): Schema {
  if (explicit) return explicit
  const selectedKeys = Object.keys(selection)
  if (selectedKeys.some((key) => !(key in columns)))
    throw new Error('Computed Drizzle selections require crud(table, { output }).')
  if (selectedKeys.length === Object.keys(columns).length) return base
  const pick = (base as { pick?: (mask: Record<string, true>) => Schema }).pick
  if (!pick) throw new Error('Partial Drizzle selections require a pick-capable schema or crud(table, { output }).')
  return pick.call(base, Object.fromEntries(selectedKeys.map((key) => [key, true])))
}

function arraySchema(schema: Schema): Schema<unknown, unknown[]> {
  return {
    parse: (value) => {
      if (!Array.isArray(value)) throw new Error('Expected an array.')
      return value.map((item) => schema.parse(item))
    },
    _input: undefined as never,
    _output: undefined as never,
  }
}

function nullableSchema(schema: Schema): Schema<unknown, unknown | null> {
  return {
    parse: (value) => (value === null ? null : schema.parse(value)),
    _input: undefined as never,
    _output: undefined as never,
  }
}

function protectedWriteSchema(schema: Schema, archive?: string): Schema {
  if (!archive) return schema
  return {
    parse(value: unknown) {
      if (typeof value === 'object' && value !== null && archive in value) {
        throw new Error(`Archive marker "${archive}" cannot be written through ordinary CRUD routes.`)
      }
      return schema.parse(value)
    },
    _input: undefined as never,
    _output: undefined as never,
  }
}

function nonEmptyUpdateSchema(schema: Schema): Schema {
  return {
    parse(value: unknown) {
      const parsed = schema.parse(value)
      if (
        typeof parsed !== 'object' ||
        parsed === null ||
        Array.isArray(parsed) ||
        Object.values(parsed).every((item) => item === undefined)
      ) {
        throw new Error('Update patches must contain at least one field.')
      }
      return parsed
    },
    _input: undefined as never,
    _output: undefined as never,
  }
}

function archiveCondition(definition: DefinedTable<Table, any>) {
  if (!definition.archive) return undefined
  const column = getTableColumns(definition.table)[definition.archive]
  if (!column) throw new Error(`Archive column "${String(definition.archive)}" does not belong to the table.`)
  const dataType = String(column.dataType ?? '').split(' ')[0]
  if (dataType === 'boolean') return column.notNull ? eq(column, false) : or(eq(column, false), isNull(column))
  if (!column.notNull && (dataType === 'date' || /date|time/i.test(column.columnType))) return isNull(column)
  throw new Error(`Archive column "${String(definition.archive)}" must be boolean or a nullable date/timestamp.`)
}

function assertArchiveColumn(columns: Record<string, any>, archive: string): void {
  const column = columns[archive]
  if (!column) throw new Error(`Archive column "${archive}" does not belong to the table.`)
  const dataType = String(column.dataType ?? '').split(' ')[0]
  if (dataType === 'boolean' || (!column.notNull && (dataType === 'date' || /date|time/i.test(column.columnType))))
    return
  throw new Error(`Archive column "${archive}" must be boolean or a nullable date/timestamp.`)
}
