// Generation-only Drizzle discovery and bulk route source.
import { access, mkdir, writeFile } from 'node:fs/promises'
import { dirname, join, relative, resolve } from 'node:path'
import { pathToFileURL } from 'node:url'
import { relativeImport, schemaHTTPWire } from '@hulla/api'
import type {
  APIPlugin,
  APISource,
  HTTPContract,
  HTTPMethod,
  HTTPWireSchemaConverter,
  HTTPWireType,
  Schema,
} from '@hulla/api'
import { getTableColumns, getTableName, getTableUniqueName, isTable } from 'drizzle-orm'
import type { Table } from 'drizzle-orm'
import { hasApiSegment, resolveSchemaFiles } from './generation/discovery'
import { pluginImports, resolvePlugins, type ResolvedPlugin } from './generation/plugins'

const hullaApiDrizzleSourceKind = 'hulla.api-drizzle.http-source'

type DrizzleOperation = 'list' | 'get' | 'create' | 'update' | 'remove' | 'restore'

const defaultOperationNames: Readonly<Record<DrizzleOperation, string>> = {
  list: 'list',
  get: 'get',
  create: 'create',
  update: 'update',
  remove: 'delete',
  restore: 'restore',
}

export type DrizzleSourceConfig = {
  readonly name?: string
  readonly config?: string
  readonly expose?: string | readonly string[]
  readonly basePath?: string
  readonly plugins?: readonly APIPlugin[]
  readonly routes: 'all'
}

export type DrizzleSource = APISource & {
  readonly $hulla: { readonly kind: typeof hullaApiDrizzleSourceKind }
  readonly config: DrizzleSourceConfig
}

type DrizzleConfigFile = {
  schema?: string | readonly string[]
}

type ColumnInfo = {
  key: string
  dataType: string
  columnType: string
  notNull: boolean
  hasDefault: boolean
  primary: boolean
  enumValues?: readonly string[]
}

type ResourceInfo = {
  exportName: string
  definitionExportName?: string
  importPath: string
  router: string
  key: ColumnInfo
  columns: ColumnInfo[]
  archive?: ColumnInfo
  schemaOverrides?: Partial<Record<'select' | 'insert' | 'update' | 'key', Schema>>
}

export function fromDrizzle(config: DrizzleSourceConfig): DrizzleSource {
  if (config?.routes !== 'all') {
    throw new Error("fromDrizzle() requires { routes: 'all' }; omit the source when routers are declared manually.")
  }

  return {
    name: config.name ?? 'drizzle',
    $hulla: { kind: hullaApiDrizzleSourceKind },
    config,
    async generate(context) {
      const sourceName = config.name ?? 'drizzle'
      const configPath = await findDrizzleConfig(context.cwd, config.config)
      const drizzleConfig = await importDefault<DrizzleConfigFile>(configPath)
      const patterns = normalizeList(config.expose ?? drizzleConfig.schema)

      if (patterns.length === 0) {
        throw new Error(`Drizzle config ${configPath} does not declare any schema files.`)
      }

      const allFiles = await resolveSchemaFiles(dirname(configPath), patterns)
      const exposedFiles =
        config.expose === undefined
          ? allFiles.filter((file) => hasApiSegment(relative(dirname(configPath), file)))
          : allFiles

      if (exposedFiles.length === 0) {
        throw new Error(
          'No exposed Drizzle schemas were found. Put public tables in a schema/api directory or configure fromDrizzle({ expose }).'
        )
      }

      const resources = await discoverResources(exposedFiles)
      validateResources(resources)
      const plugins = resolvePlugins(config.plugins ?? [])
      const collections = generatedCollections(resources, plugins)
      const serverPath = join(context.sourceDir, 'server.ts')
      const clientPath = join(context.sourceDir, 'index.ts')
      const manifestPath = join(context.sourceDir, 'contract.json')
      const contractPath = join(context.sourceDir, 'contract.ts')
      const contract = createContract(resources, config.basePath ?? '/api', context.schemaConverters ?? [])

      await mkdir(context.sourceDir, { recursive: true })
      await writeFile(serverPath, generateServer(resources, context.sourceDir))
      await writeFile(clientPath, generateClient(resources, contract, plugins))
      await writeFile(manifestPath, `${JSON.stringify(contract, null, 2)}\n`)
      await writeFile(contractPath, generateContractModule(contract))

      return {
        name: sourceName,
        baseUrl: config.basePath ?? '/api',
        importPath: `./sources/${sourceName}`,
        factoryName: 'createDrizzleClient',
        transport: 'http' as const,
        inputs: [configPath, ...exposedFiles],
        inputGlobs: patterns,
        server: {
          importPath: `./sources/${sourceName}/server`,
          factoryName: 'createDrizzleRouters',
        },
        contract: { importPath: `./sources/${sourceName}/contract`, exportName: 'httpContract' },
        ...(collections.length === 0 ? {} : { collections }),
        outputs: {
          server: serverPath,
          manifest: manifestPath,
          contract: contractPath,
          client: clientPath,
        },
      }
    },
  }
}

function generatedCollections(resources: readonly ResourceInfo[], plugins: readonly ResolvedPlugin[]) {
  const plugin = plugins.find(
    (candidate) =>
      candidate.id === 'tanstackDb' ||
      (candidate.from === '@hulla/api-tanstack-db' && candidate.name === 'tanstackDbPlugin')
  )
  if (plugin === undefined) return []
  if ((plugin.options as { collections?: unknown } | undefined)?.collections === false) return []
  const namespace = (plugin.options as { namespace?: unknown } | undefined)?.namespace
  return resources.map((resource) => ({
    router: resource.router,
    key: resource.key.key,
    ...(typeof namespace === 'string' && namespace !== 'tanstack' ? { namespace } : {}),
  }))
}

async function discoverResources(files: readonly string[]): Promise<ResourceInfo[]> {
  const resources: ResourceInfo[] = []
  const discoveredTables = new Set<string>()

  for (const file of files) {
    const module = await import(`${pathToFileURL(file).href}?hulla=${Date.now()}`)
    const definitions = new Map<
      string,
      {
        exportName: string
        archive?: string
        schemas?: Record<string, Schema>
        schemaOverrides?: readonly string[]
      }
    >()
    for (const [exportName, value] of Object.entries(module)) {
      if (
        typeof value === 'object' &&
        value !== null &&
        (value as { $hulla?: { kind?: unknown } }).$hulla?.kind === 'hulla.api-drizzle.table' &&
        isTable((value as { table?: unknown }).table)
      ) {
        const definition = value as {
          table: Table
          archive?: string
          schemas?: Record<string, Schema>
          'hulla.api.schemaOverrides'?: readonly string[]
        }
        const name = getTableUniqueName(definition.table)
        if (definitions.has(name))
          throw new Error(`Drizzle table "${getTableName(definition.table)}" has multiple defineTable() exports.`)
        definitions.set(name, {
          exportName,
          archive: definition.archive,
          schemas: definition.schemas,
          schemaOverrides: definition['hulla.api.schemaOverrides'],
        })
      }
    }

    for (const [exportName, value] of Object.entries(module)) {
      if (!isTable(value)) continue
      const table = value as Table
      const uniqueName = getTableUniqueName(table)
      if (discoveredTables.has(uniqueName)) continue
      discoveredTables.add(uniqueName)
      const columns = Object.entries(getTableColumns(table)).map(([key, column]) => columnInfo(key, column))
      const primary = columns.filter((column) => column.primary)
      const definition = definitions.get(uniqueName)

      if (primary.length !== 1) {
        const detail = primary.length === 0 ? 'no primary key' : 'a composite primary key'
        throw new Error(
          `Exposed Drizzle table "${getTableName(table)}" has ${detail}; v1 requires one primary-key column.`
        )
      }

      resources.push({
        exportName,
        definitionExportName: definition?.exportName,
        importPath: file,
        router: conventionalRouterName(exportName, getTableName(table)),
        key: primary[0]!,
        columns,
        ...(definition?.schemas && definition.schemaOverrides?.length
          ? {
              schemaOverrides: Object.fromEntries(
                definition.schemaOverrides.map((key) => [key, definition.schemas![key]!])
              ),
            }
          : {}),
        ...(definition?.archive === undefined
          ? {}
          : { archive: columns.find((column) => column.key === definition.archive) }),
      })
    }
  }

  return resources
}

function validateResources(resources: readonly ResourceInfo[]): void {
  const routers = new Set<string>()
  for (const resource of resources) {
    assertSafeMember(resource.router, 'router')
    if (routers.has(resource.router)) throw new Error(`Generated Drizzle routers collide on "${resource.router}".`)
    routers.add(resource.router)

    const activeRoles: DrizzleOperation[] = ['list', 'get', 'create', 'update', 'remove']
    if (resource.archive) activeRoles.push('restore')
    const names = new Set<string>()
    for (const role of activeRoles) {
      const name = defaultOperationNames[role]
      assertSafeMember(name, `${resource.router}.${role} procedure`)
      if (new Set(['$meta', 'call', 'key']).has(name)) {
        throw new Error(`Generated procedure name "${resource.router}.${name}" is reserved by @hulla/api.`)
      }
      if (names.has(name)) throw new Error(`Generated procedures collide on "${resource.router}.${name}".`)
      names.add(name)
    }
  }
}

function generateServer(resources: readonly ResourceInfo[], sourceDir: string): string {
  const needsDefineTable = resources.some((resource) => resource.archive && !resource.definitionExportName)
  const lines = [
    `import { crud${needsDefineTable ? ', defineTable' : ''} } from '@hulla/api-drizzle'`,
    `import type { DrizzleRouterAPI } from '@hulla/api-drizzle'`,
  ]
  const imports = groupTableImports(resources, sourceDir)
  for (const [path, names] of imports) lines.push(`import { ${[...names].join(', ')} } from ${JSON.stringify(path)}`)
  lines.push('')
  lines.push('export function createDrizzleRouters(options: { api: DrizzleRouterAPI }) {')
  lines.push('  const { api } = options')
  lines.push('  return {')
  for (const resource of resources) {
    const model = resource.definitionExportName
      ? resource.definitionExportName
      : resource.archive
        ? `defineTable(${resource.exportName}, { archive: ${JSON.stringify(resource.archive.key)} })`
        : resource.exportName
    lines.push(
      `    ${safeKey(resource.router)}: api.router(${JSON.stringify(resource.router)}).define(crud(${model})),`
    )
  }
  lines.push('  }')
  lines.push('}', '')
  return lines.join('\n')
}

function generateClient(
  resources: readonly ResourceInfo[],
  contract: HTTPContract,
  plugins: readonly ResolvedPlugin[]
): string {
  const lines = [
    "import { createApi } from '@hulla/api'",
    "import type { HTTPWireInput, HTTPWireOutput } from '@hulla/api'",
    "import { clientProcedure, clientSchema } from '@hulla/api/client'",
    "import type { HttpTransport } from '@hulla/api/client'",
    "import { httpContract } from './contract'",
    ...pluginImports(plugins),
  ]
  lines.push('')
  for (const [resourceIndex, resource] of resources.entries()) {
    for (const [operationIndex, role] of activeOperations(resource).entries()) {
      const publicName = defaultOperationNames[role]
      const route = contract.routes[resource.router]![publicName]!
      const typePrefix = `Router${resourceIndex + 1}Procedure${operationIndex + 1}`
      const contractType = `typeof httpContract.routes[${JSON.stringify(resource.router)}][${JSON.stringify(publicName)}]`
      if (route.input?.kind === 'tuple') {
        for (const inputIndex of route.input.items.keys()) {
          lines.push(
            `type ${typePrefix}Input${inputIndex + 1} = HTTPWireInput<${contractType}['input']['items'][${inputIndex}]>`
          )
        }
      } else if (route.input?.kind === 'value') {
        lines.push(`type ${typePrefix}Input = HTTPWireInput<${contractType}['input']['wire']>`)
      }
      lines.push(`type ${typePrefix}Output = HTTPWireOutput<${contractType}['output']>`)
    }
  }
  lines.push(
    '',
    'export function createDrizzleClient(transport: HttpTransport) {',
    `  const api = createApi({ plugins: [${plugins.map((plugin) => plugin.expression).join(', ')}] as const })`,
    '  return {'
  )
  for (const [resourceIndex, resource] of resources.entries()) {
    lines.push(
      `    ${safeKey(resource.router)}: api.router(${JSON.stringify(resource.router)}).define(({ procedure }) => ({`
    )
    for (const [operationIndex, role] of activeOperations(resource).entries()) {
      const publicName = defaultOperationNames[role]
      const typePrefix = `Router${resourceIndex + 1}Procedure${operationIndex + 1}`
      const outputType = `${typePrefix}Output`
      const routeExpression = `httpContract.routes[${JSON.stringify(resource.router)}][${JSON.stringify(publicName)}]`
      if (role === 'list') {
        lines.push(
          `      ${safeKey(publicName)}: clientProcedure(procedure.output(clientSchema<${outputType}>()).handler(() => transport.call<${outputType}>(${routeExpression})), (options) => transport.request<${outputType}>(${routeExpression}, options)),`
        )
      } else {
        if (role === 'update') {
          lines.push(
            `      ${safeKey(publicName)}: clientProcedure(procedure.input(clientSchema<${typePrefix}Input1>(), clientSchema<${typePrefix}Input2>()).output(clientSchema<${outputType}>()).handler(({ input }) => transport.call<${outputType}>(${routeExpression}, ...input)), (options, ...input) => transport.request<${outputType}>(${routeExpression}, options, ...input)),`
          )
        } else {
          lines.push(
            `      ${safeKey(publicName)}: clientProcedure(procedure.input(clientSchema<${typePrefix}Input>()).output(clientSchema<${outputType}>()).handler(({ input }) => transport.call<${outputType}>(${routeExpression}, input)), (options, input) => transport.request<${outputType}>(${routeExpression}, options, input)),`
          )
        }
      }
    }
    lines.push('    })),')
  }
  lines.push('  }', '}', '')
  return lines.join('\n')
}

function createContract(
  resources: readonly ResourceInfo[],
  basePath: string,
  schemaConverters: readonly HTTPWireSchemaConverter[]
): HTTPContract {
  return {
    version: 1,
    source: 'api-drizzle-http-routes',
    basePath,
    routes: Object.fromEntries(
      resources.map((resource) => [
        resource.router,
        Object.fromEntries(
          activeOperations(resource).map((role) => {
            const route = operationRoute(resource, role)
            const procedure = defaultOperationNames[role]
            const input = operationInput(resource, role, schemaConverters)
            return [
              procedure,
              {
                router: resource.router,
                procedure,
                ...route,
                ...(input ? { input } : {}),
                output: operationOutput(resource, role, schemaConverters),
              },
            ]
          })
        ),
      ])
    ),
  }
}

function generateContractModule(contract: HTTPContract): string {
  return [
    "import type { HTTPContract } from '@hulla/api'",
    '',
    `export const httpContract = ${JSON.stringify(contract, null, 2)} as const satisfies HTTPContract`,
    '',
  ].join('\n')
}

function operationInput(
  resource: ResourceInfo,
  role: DrizzleOperation,
  converters: readonly HTTPWireSchemaConverter[]
) {
  if (role === 'list') return undefined
  const key = resource.schemaOverrides?.key
    ? schemaHTTPWire(resource.schemaOverrides.key, converters, 'input')
    : columnWire(resource.key)
  if (role === 'update') {
    const update = resource.schemaOverrides?.update
      ? schemaHTTPWire(resource.schemaOverrides.update, converters, 'input')
      : modelWire(resource, 'update')
    return { kind: 'tuple' as const, items: [key, update] }
  }
  if (role === 'create') {
    const insert = resource.schemaOverrides?.insert
      ? schemaHTTPWire(resource.schemaOverrides.insert, converters, 'input')
      : modelWire(resource, 'insert')
    return { kind: 'value' as const, wire: insert }
  }
  return { kind: 'value' as const, wire: key }
}

function operationOutput(
  resource: ResourceInfo,
  role: DrizzleOperation,
  converters: readonly HTTPWireSchemaConverter[]
): HTTPWireType {
  const selected = resource.schemaOverrides?.select
    ? schemaHTTPWire(resource.schemaOverrides.select, converters, 'output')
    : modelWire(resource, 'select')
  if (role === 'list') return { kind: 'array', items: selected }
  if (role === 'get') return { kind: 'nullable', value: selected }
  return selected
}

function modelWire(resource: ResourceInfo, mode: 'select' | 'insert' | 'update'): HTTPWireType {
  const properties: Record<string, HTTPWireType> = {}
  for (const column of resource.columns) {
    if (mode !== 'select' && column.key === resource.archive?.key) continue
    if (mode === 'update' && column.primary) continue
    const optional = mode === 'update' || (mode === 'insert' && (column.hasDefault || !column.notNull))
    const wire = columnWire(column)
    properties[column.key] = optional ? { kind: 'optional', value: wire } : wire
  }
  return { kind: 'object', properties, additionalProperties: false }
}

function columnWire(column: ColumnInfo): HTTPWireType {
  let wire: HTTPWireType
  if (column.enumValues && column.enumValues.length > 0) wire = { kind: 'enum', values: column.enumValues }
  else if (column.dataType === 'number') wire = { kind: 'number' }
  else if (column.dataType === 'boolean') wire = { kind: 'boolean' }
  else if (column.dataType === 'bigint') wire = { kind: 'bigint', encoding: 'decimal' }
  else if (column.dataType === 'date') wire = { kind: 'date', encoding: 'iso' }
  else if (column.dataType === 'bytes') wire = { kind: 'bytes', encoding: 'base64' }
  else if (column.dataType === 'array') wire = { kind: 'array', items: { kind: 'json' } }
  else if (column.dataType === 'json') wire = { kind: 'json' }
  else if (column.dataType === 'string') wire = { kind: 'string' }
  else throw new Error(`Unsupported Drizzle column "${column.key}" (${column.columnType}/${column.dataType}).`)
  return column.notNull ? wire : { kind: 'nullable', value: wire }
}

function operationRoute(resource: ResourceInfo, role: DrizzleOperation): { method: HTTPMethod; path: string } {
  const method =
    role === 'list' || role === 'get'
      ? 'GET'
      : role === 'create' || role === 'restore'
        ? 'POST'
        : role === 'update'
          ? 'PATCH'
          : 'DELETE'
  const path =
    role === 'list' || role === 'create'
      ? `/${resource.router}`
      : role === 'restore'
        ? `/${resource.router}/:${resource.key.key}/restore`
        : `/${resource.router}/:${resource.key.key}`
  return { method, path }
}

function activeOperations(resource: ResourceInfo): DrizzleOperation[] {
  return ['list', 'get', 'create', 'update', 'remove', ...(resource.archive ? ['restore' as const] : [])]
}

function columnInfo(key: string, value: unknown): ColumnInfo {
  const column = value as {
    dataType?: string
    columnType?: string
    notNull?: boolean
    hasDefault?: boolean
    primary?: boolean
    enumValues?: readonly string[]
  }
  return {
    key,
    dataType: normalizeDataType(column.dataType, column.columnType),
    columnType: column.columnType ?? 'unknown',
    notNull: column.notNull === true,
    hasDefault: column.hasDefault === true,
    primary: column.primary === true,
    enumValues: column.enumValues,
  }
}

function normalizeDataType(value: string | undefined, columnType: string | undefined): string {
  if (/\bjson\b/i.test(value ?? '') || /json/i.test(columnType ?? '')) return 'json'
  if (/\b(?:buffer|bytes?)\b/i.test(value ?? '') || /(?:buffer|bytea)/i.test(columnType ?? '')) return 'bytes'
  const type = value?.split(' ')[0] ?? 'unknown'
  if (type === 'object' && /(?:date|time)/i.test(columnType ?? '')) return 'date'
  return type
}

function groupTableImports(resources: readonly ResourceInfo[], sourceDir: string): Map<string, Set<string>> {
  const result = new Map<string, Set<string>>()
  for (const resource of resources) {
    const path = relativeImport(sourceDir, resource.importPath)
    const names = result.get(path) ?? new Set<string>()
    names.add(resource.definitionExportName ?? resource.exportName)
    result.set(path, names)
  }
  return result
}

async function findDrizzleConfig(cwd: string, configured?: string): Promise<string> {
  if (configured) {
    const path = resolve(cwd, configured)
    await access(path)
    return path
  }
  let directory = cwd
  while (true) {
    for (const extension of ['ts', 'mts', 'cts', 'js', 'mjs', 'cjs']) {
      const candidate = join(directory, `drizzle.config.${extension}`)
      try {
        await access(candidate)
        return candidate
      } catch {}
    }
    const parent = dirname(directory)
    if (parent === directory) break
    directory = parent
  }
  throw new Error(`Could not find drizzle.config.* from ${cwd}. Pass fromDrizzle({ config }) to select one.`)
}

function normalizeList(value: string | readonly string[] | undefined): string[] {
  return value === undefined ? [] : typeof value === 'string' ? [value] : [...value]
}

async function importDefault<T>(path: string): Promise<T> {
  const module = (await import(`${pathToFileURL(path).href}?hulla=${Date.now()}`)) as { default?: T }
  if (!module.default) throw new Error(`Drizzle config ${path} has no default export.`)
  return module.default
}

function conventionalRouterName(exportName: string, tableName: string): string {
  return exportName.replace(/Table$/, '') || tableName
}

function assertSafeMember(name: string, kind: string): void {
  if (!/^[A-Za-z_$][A-Za-z0-9_$-]*$/.test(name) || name.includes('/') || name === '.' || name === '..') {
    throw new Error(`Invalid ${kind} name "${name}"; names must be safe JavaScript members and URL path segments.`)
  }
}

function safeKey(value: string): string {
  return /^[A-Za-z_$][A-Za-z0-9_$]*$/.test(value) ? value : JSON.stringify(value)
}
