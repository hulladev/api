import { lstat, mkdir, mkdtemp, readFile, readdir, rename, rm, writeFile } from 'node:fs/promises'
import { basename, dirname, isAbsolute, join, relative, resolve } from 'node:path'
import { pathToFileURL } from 'node:url'
import { collectLocalDependencies, walkRouterFiles } from './generation/discovery'
import { generateFetchClientCode } from './generation/fetch-client'
import { matchesGlob } from './generation/glob'
import { isInputTupleSchema } from './input'
import type {
  APIPlugin,
  APIMeta,
  HTTPContract,
  HTTPInputContract,
  HTTPWireSchemaConverter,
  Middleware,
  Schema,
} from './types.public'
import { schemaHTTPWire } from './wire'

const hullaApiClientConfigKind = 'hulla.api.client-config'

const generatedManifestPath = '.hulla/manifest.json'

export type APIClientGenerateConfig = {
  readonly $hulla: {
    readonly kind: typeof hullaApiClientConfigKind
  }
  readonly sources: readonly APISource[]
  readonly output: APIClientOutputConfig
  readonly routers?: APIRouterDiscoveryConfig | false
  readonly schemaConverters?: readonly HTTPWireSchemaConverter[]
}

export type APIClientOutputConfig = {
  readonly dir: string
  readonly entry?: string
}

export type APIClientGenerateInput = {
  readonly sources?: readonly APISource[]
  readonly output: APIClientOutputConfig
  readonly routers?: APIRouterDiscoveryConfig | false
  readonly schemaConverters?: readonly HTTPWireSchemaConverter[]
}

export type APIRouterDiscoveryConfig = {
  readonly dir?: string
  readonly include?: readonly string[]
  readonly exclude?: readonly string[]
}

export type APISource = {
  readonly name?: string
  readonly inputs?: readonly string[]
  generate: (context: APISourceGenerateContext) => Promise<APISourceGenerateResult> | APISourceGenerateResult
}

export type APISourceGenerateContext = {
  readonly cwd: string
  readonly configPath: string
  readonly outDir: string
  readonly sourceDir: string
  readonly sources: readonly APISourceGenerateResult[]
  readonly schemaConverters?: readonly HTTPWireSchemaConverter[]
}

export type APISourceGenerateResult = {
  readonly name: string
  readonly baseUrl?: string
  readonly importPath?: string
  readonly factoryName?: string
  readonly outputs?: Record<string, string>
  readonly transport?: 'openapi' | 'http'
  readonly inputs?: readonly string[]
  readonly inputGlobs?: readonly string[]
  readonly server?: {
    readonly importPath: string
    readonly factoryName: string
  }
  readonly contract?: {
    readonly importPath: string
    readonly exportName: string
  }
  readonly collections?: readonly APIGeneratedCollection[]
}

export type APIGeneratedCollection = {
  readonly router: string
  readonly key: string
  readonly namespace?: string
}

export type RunGenerateConfigOptions = {
  readonly cwd?: string
  readonly configPath?: string
}

export type RunGenerateConfigResult = {
  readonly outputDir: string
  readonly entry?: string
  readonly sources: readonly APISourceGenerateResult[]
}

export function generate<const Config extends APIClientGenerateInput>(
  config: Config
): APIClientGenerateConfig & Config {
  return {
    ...config,
    sources: config.sources ?? [],
    $hulla: {
      kind: hullaApiClientConfigKind,
    },
  }
}

export async function runGenerateConfig(
  config: APIClientGenerateConfig,
  options: RunGenerateConfigOptions = {}
): Promise<RunGenerateConfigResult> {
  const cwd = resolve(options.cwd ?? process.cwd())
  const outputDir = resolve(cwd, config.output.dir)
  const entry = config.output.entry === undefined ? undefined : resolve(cwd, config.output.entry)
  assertStrictDescendant(cwd, outputDir, 'Generated output directory')
  if (entry !== undefined) assertStrictDescendant(cwd, entry, 'Generated client entry')
  if (entry !== undefined && isSameOrDescendant(outputDir, entry)) {
    throw new Error('Generated client entry must be outside the generated output directory.')
  }
  await assertSafeOutputPath(cwd, outputDir)
  if (entry !== undefined) await assertSafeOutputPath(cwd, entry)
  await assertOwnedOutput(outputDir)
  await mkdir(dirname(outputDir), { recursive: true })
  const temporaryDir = await mkdtemp(join(dirname(outputDir), `.${basename(outputDir)}.hulla-`))
  const backupDir = `${temporaryDir}-backup`
  const temporaryConfig: APIClientGenerateConfig = {
    ...config,
    output: { dir: temporaryDir },
  }
  let previousMoved = false
  let promoted = false

  try {
    const generated = await runGenerateConfigUnsafe(temporaryConfig, { ...options, cwd })
    await writeGeneratedManifest(temporaryDir)
    try {
      await rename(outputDir, backupDir)
      previousMoved = true
    } catch (error) {
      if ((error as { code?: string }).code !== 'ENOENT') throw error
    }
    await rename(temporaryDir, outputDir)
    promoted = true
    if (entry !== undefined) {
      await mkdir(dirname(entry), { recursive: true })
      await writeFile(entry, `export * from '${relativeImport(dirname(entry), outputDir)}'\n`)
    }
    if (previousMoved) {
      previousMoved = false
      await rm(backupDir, { recursive: true }).catch(() => undefined)
    }

    return {
      outputDir,
      entry,
      sources: generated.sources.map((source) => remapGeneratedPaths(source, temporaryDir, outputDir)),
    }
  } catch (error) {
    let recoveryError: unknown
    if (previousMoved) {
      try {
        if (promoted) await rm(outputDir, { recursive: true })
        await rename(backupDir, outputDir)
        previousMoved = false
        promoted = false
      } catch (reason) {
        recoveryError = reason
      }
    } else if (promoted) {
      try {
        await rm(outputDir, { recursive: true })
        promoted = false
      } catch (reason) {
        recoveryError = reason
      }
    }
    await rm(temporaryDir, { recursive: true, force: true }).catch(() => undefined)
    if (recoveryError !== undefined) {
      const preserved = previousMoved ? ` Previous output is preserved at ${backupDir}.` : ''
      throw new Error(`API generation failed and recovery was incomplete.${preserved}`, {
        cause: new AggregateError([error, recoveryError]),
      })
    }
    throw error
  }
}

function assertStrictDescendant(root: string, target: string, description: string): void {
  const fromRoot = relative(root, target)
  if (
    fromRoot.length === 0 ||
    isAbsolute(fromRoot) ||
    fromRoot === '..' ||
    fromRoot.startsWith('../') ||
    fromRoot.startsWith('..\\')
  ) {
    throw new Error(`${description} must be inside the project directory.`)
  }
}

function isSameOrDescendant(root: string, target: string): boolean {
  const fromRoot = relative(root, target)
  return (
    fromRoot.length === 0 ||
    (!isAbsolute(fromRoot) && fromRoot !== '..' && !fromRoot.startsWith('../') && !fromRoot.startsWith('..\\'))
  )
}

async function assertSafeOutputPath(cwd: string, outputDir: string): Promise<void> {
  const parts = relative(cwd, outputDir).split(/[\\/]/).filter(Boolean)
  let current = cwd
  for (const part of parts) {
    current = join(current, part)
    try {
      const info = await lstat(current)
      if (info.isSymbolicLink()) throw new Error(`Generated output path cannot contain a symbolic link: ${current}`)
    } catch (error) {
      if ((error as { code?: string }).code === 'ENOENT') return
      throw error
    }
  }
}

async function assertOwnedOutput(outputDir: string): Promise<void> {
  let info
  try {
    info = await lstat(outputDir)
  } catch (error) {
    if ((error as { code?: string }).code === 'ENOENT') return
    throw error
  }
  if (!info.isDirectory()) throw new Error(`Generated output path is not a directory: ${outputDir}`)
  if ((await readdir(outputDir)).length === 0) return

  try {
    const manifestPath = join(outputDir, generatedManifestPath)
    const manifestDirectoryInfo = await lstat(dirname(manifestPath))
    if (!manifestDirectoryInfo.isDirectory() || manifestDirectoryInfo.isSymbolicLink()) {
      throw new Error('manifest directory is not a regular directory')
    }
    const manifestInfo = await lstat(manifestPath)
    if (!manifestInfo.isFile() || manifestInfo.isSymbolicLink()) throw new Error('manifest is not a regular file')
    const manifest = JSON.parse(await readFile(manifestPath, 'utf8')) as {
      version?: unknown
    }
    if (manifest.version !== 1) throw new Error('unsupported manifest version')
  } catch (error) {
    const reason = error instanceof Error ? error.message : String(error)
    throw new Error(`Refusing to replace unowned generated output directory ${outputDir}: ${reason}`)
  }
}

async function writeGeneratedManifest(outputDir: string): Promise<void> {
  const path = join(outputDir, generatedManifestPath)
  await mkdir(dirname(path), { recursive: true })
  await writeFile(path, `${JSON.stringify({ version: 1 }, null, 2)}\n`)
}

async function runGenerateConfigUnsafe(
  config: APIClientGenerateConfig,
  options: RunGenerateConfigOptions = {}
): Promise<RunGenerateConfigResult> {
  const cwd = options.cwd ?? process.cwd()
  const configPath = resolve(cwd, options.configPath ?? 'api.config.ts')
  const outputDir = resolve(cwd, config.output.dir)
  const sourcesDir = join(outputDir, 'sources')
  const sourceResults: APISourceGenerateResult[] = []
  const configuredSourceNames = new Set<string>()

  await mkdir(sourcesDir, { recursive: true })

  if (config.routers !== false) {
    const local = await generateLocalRouters(cwd, outputDir, config.routers, config.schemaConverters ?? [])
    if (local) sourceResults.push(local)
  }

  for (const [index, source] of (config.sources ?? []).entries()) {
    const sourceName = source.name ?? `source${index + 1}`

    assertSafeSourceName(sourceName)
    if (configuredSourceNames.has(sourceName)) {
      throw new Error(`Duplicate API source name "${sourceName}".`)
    }
    configuredSourceNames.add(sourceName)
    const sourceDir = join(sourcesDir, sourceName)
    await mkdir(sourceDir, { recursive: true })

    const result = await source.generate({
      cwd,
      configPath,
      outDir: outputDir,
      sourceDir,
      sources: sourceResults,
      schemaConverters: config.schemaConverters ?? [],
    })

    if (sourceResults.some((candidate) => candidate.name === result.name)) {
      throw new Error(`Duplicate generated API source name "${result.name}".`)
    }
    sourceResults.push(result)
  }

  await writeFile(join(outputDir, 'fetch.ts'), generateFetchClientCode())
  await writeFile(join(outputDir, 'index.ts'), generateIndexCode(sourceResults))
  await writeFile(join(outputDir, 'server.ts'), generateServerIndexCode(sourceResults))

  return {
    outputDir,
    sources: sourceResults,
  }
}

type DiscoveredRouter = {
  readonly file: string
  readonly exportName: string
  readonly value: Record<string, any>
  readonly name: string
  readonly api: APIMeta<Middleware, any, any>
  readonly generation?: unknown
}

async function generateLocalRouters(
  cwd: string,
  outputDir: string,
  config: APIRouterDiscoveryConfig | undefined,
  schemaConverters: readonly HTTPWireSchemaConverter[]
): Promise<APISourceGenerateResult | undefined> {
  const root = resolve(cwd, config?.dir ?? 'src/api')
  const files = (await walkRouterFiles(root)).filter((file) => {
    if (file.startsWith(`${outputDir}/`)) return false
    const path = relative(cwd, file).replace(/\\/g, '/')
    if (config?.include && !config.include.some((pattern) => matchesGlob(path, pattern))) return false
    return !config?.exclude?.some((pattern) => matchesGlob(path, pattern))
  })
  if (files.length === 0) return undefined
  const routers: DiscoveredRouter[] = []
  const seenValues = new Set<object>()
  const seenNames = new Set<string>()

  for (const file of files) {
    const module = (await import(`${pathToFileURL(file).href}?hulla=${Date.now()}`)) as Record<string, unknown>
    for (const [exportName, value] of Object.entries(module)) {
      if (typeof value !== 'object' || value === null || seenValues.has(value)) continue
      const marker = (value as Record<PropertyKey, unknown>)[Symbol.for('hulla.api.router-definition')] as
        | { name?: unknown; api?: unknown; generation?: unknown }
        | undefined
      if (typeof marker?.name !== 'string' || typeof marker.api !== 'object' || marker.api === null) continue
      if (seenNames.has(marker.name)) throw new Error(`Discovered routers collide on "${marker.name}".`)
      seenNames.add(marker.name)
      seenValues.add(value)
      routers.push({
        file,
        exportName,
        value: value as Record<string, any>,
        name: marker.name,
        api: marker.api as APIMeta<Middleware, any, any>,
        ...(marker.generation === undefined ? {} : { generation: marker.generation }),
      })
    }
  }
  if (routers.length === 0) return undefined

  const clientPath = join(outputDir, 'routes.ts')
  const serverPath = join(outputDir, 'routes.server.ts')
  const contractJSONPath = join(outputDir, 'routes.contract.json')
  const contractTSPath = join(outputDir, 'routes.contract.ts')
  const contract = createLocalRouterContract(routers, schemaConverters)
  const collections = createLocalGeneratedCollections(routers)
  await writeFile(clientPath, generateLocalRouterClient(routers, contract))
  await writeFile(serverPath, generateLocalRouterServer(routers, outputDir))
  await writeFile(contractJSONPath, `${JSON.stringify(contract, null, 2)}\n`)
  await writeFile(contractTSPath, generateContractModule(contract))
  const dependencies = await collectLocalDependencies(files)
  return {
    name: 'routes',
    baseUrl: '/api',
    importPath: './routes',
    factoryName: 'createLocalClient',
    transport: 'http',
    inputs: dependencies,
    inputGlobs: config?.include ?? [`${relative(cwd, root).replace(/\\/g, '/')}/**/*.router.{ts,mts,cts,js,mjs,cjs}`],
    server: { importPath: './routes.server', factoryName: 'routers' },
    contract: { importPath: './routes.contract', exportName: 'httpContract' },
    ...(collections.length === 0 ? {} : { collections }),
    outputs: { client: clientPath, server: serverPath, contract: contractTSPath, manifest: contractJSONPath },
  }
}

function createLocalGeneratedCollections(routers: readonly DiscoveredRouter[]): APIGeneratedCollection[] {
  const inferred = new Map<string, string>()
  const explicit = new Map<string, string>()
  const namespaces = new Map<string, string>()

  for (const router of routers) {
    const plugin = (router.api.plugins.list as readonly APIPlugin[]).find((candidate) => candidate.id === 'tanstackDb')
    const collections = (plugin?.generation?.options as { collections?: unknown } | undefined)?.collections
    if (plugin === undefined || collections === false) continue
    const namespace = plugin.namespace ?? 'tanstack'

    const inferredKey = readPresetCollectionKey(router.generation)
    if (inferredKey !== undefined) {
      inferred.set(router.name, inferredKey)
      namespaces.set(router.name, namespace)
    }
    if (collections === undefined) continue

    if (typeof collections !== 'object' || collections === null || Array.isArray(collections)) {
      throw new Error('TanStack DB generated collections must be a router-to-key object or false.')
    }
    for (const [name, value] of Object.entries(collections)) {
      const key = typeof value === 'string' ? value : readGeneratedCollectionKey(value)
      if (key === undefined || key.length === 0) {
        throw new Error(`TanStack DB generated collection "${name}" requires a non-empty string key.`)
      }
      const previous = explicit.get(name)
      if (previous !== undefined && previous !== key) {
        throw new Error(`TanStack DB generated collection "${name}" has conflicting keys.`)
      }
      explicit.set(name, key)
      const previousNamespace = namespaces.get(name)
      if (previousNamespace !== undefined && previousNamespace !== namespace) {
        throw new Error(`TanStack DB generated collection "${name}" has conflicting namespaces.`)
      }
      namespaces.set(name, namespace)
    }
  }

  const configured = new Map([...inferred, ...explicit])
  return [...configured].map(([name, key]) => {
    const router = routers.find((candidate) => candidate.name === name)
    if (router === undefined) {
      throw new Error(`TanStack DB generated collection "${name}" does not match a discovered router.`)
    }
    for (const procedure of ['list', 'create', 'update', 'delete']) {
      if (router.value[procedure]?.$meta?.route === undefined) {
        throw new Error(
          `Generated TanStack DB collection "${name}" requires an exposed ${name}.${procedure} procedure.`
        )
      }
    }
    const namespace = namespaces.get(name) ?? 'tanstack'
    return { router: name, key, ...(namespace === 'tanstack' ? {} : { namespace }) }
  })
}

function readPresetCollectionKey(value: unknown): string | undefined {
  if (typeof value !== 'object' || value === null) return undefined
  const collection = (value as { collection?: unknown }).collection
  return readGeneratedCollectionKey(collection)
}

function readGeneratedCollectionKey(value: unknown): string | undefined {
  if (typeof value !== 'object' || value === null) return undefined
  const key = (value as { key?: unknown }).key
  return typeof key === 'string' ? key : undefined
}

function createLocalRouterContract(
  routers: readonly DiscoveredRouter[],
  schemaConverters: readonly HTTPWireSchemaConverter[]
): HTTPContract {
  return {
    version: 1,
    source: 'router-files',
    basePath: '/api',
    routes: Object.fromEntries(
      routers.map((router) => [
        router.name,
        Object.fromEntries(
          Object.entries(router.value).flatMap(([name, procedure]) => {
            const route = procedure?.$meta?.route
            if (!route) return []
            const input = procedure.$meta.input
              ? createInputContract(procedure.$meta.input, schemaConverters)
              : undefined
            let output
            if (procedure.$meta.output) {
              try {
                output = schemaHTTPWire(procedure.$meta.output, schemaConverters, 'output')
              } catch {}
            }
            return [
              [
                name,
                {
                  router: router.name,
                  procedure: name,
                  method: route.method,
                  path: `/${router.name}${route.path === '/' ? '' : route.path}`,
                  ...(input ? { input } : {}),
                  ...(output ? { output } : {}),
                },
              ],
            ]
          })
        ),
      ])
    ),
  }
}

function createInputContract(schema: Schema, converters: readonly HTTPWireSchemaConverter[]): HTTPInputContract {
  if (isInputTupleSchema(schema)) {
    return {
      kind: 'tuple',
      items: schema['hulla.api.inputSchemas'].map((item) => schemaHTTPWire(item, converters, 'input')),
    }
  }
  return { kind: 'value', wire: schemaHTTPWire(schema, converters, 'input') }
}

function generateContractModule(contract: HTTPContract): string {
  return [
    "import type { HTTPContract } from '@hulla/api'",
    '',
    `export const httpContract = ${JSON.stringify(contract, null, 2)} as const satisfies HTTPContract`,
    '',
  ].join('\n')
}

function generateLocalRouterServer(routers: readonly DiscoveredRouter[], outputDir: string): string {
  const lines = routers.map(
    (router, index) =>
      `import { ${router.exportName} as router${index + 1} } from ${quote(relativeImport(outputDir, router.file))}`
  )
  lines.push('', `export const routers = [${routers.map((_, index) => `router${index + 1}`).join(', ')}] as const`, '')
  return lines.join('\n')
}

function generateLocalRouterClient(routers: readonly DiscoveredRouter[], contract: HTTPContract): string {
  const lines = [
    "import { createApi } from '@hulla/api'",
    "import type { HTTPWireInput, HTTPWireOutput } from '@hulla/api'",
    "import { clientProcedure, clientSchema } from '@hulla/api/client'",
    "import type { HttpTransport } from '@hulla/api/client'",
    "import { httpContract } from './routes.contract'",
  ]
  const pluginFactories = new Map<string, { local: string; from: string; name: string }>()
  const routerPlugins: string[][] = []

  for (const router of routers) {
    const expressions: string[] = []
    for (const plugin of router.api.plugins.list as readonly APIPlugin[]) {
      if (plugin.target === 'server') continue
      if (!plugin.generation)
        throw new Error(`Plugin "${plugin.id}" cannot be generated because it has no source metadata.`)
      const key = `${plugin.generation.from}\0${plugin.generation.name}`
      let factory = pluginFactories.get(key)
      if (!factory) {
        factory = {
          local: `pluginFactory${pluginFactories.size + 1}`,
          from: plugin.generation.from,
          name: plugin.generation.name,
        }
        pluginFactories.set(key, factory)
      }
      const options =
        plugin.generation.options === undefined ? '' : serializeGenerationOptions(plugin.generation.options)
      expressions.push(`${factory.local}(${options})`)
    }
    routerPlugins.push(expressions)
  }

  if (pluginFactories.size > 0) {
    lines.push(
      ...[...pluginFactories.values()].map(
        (factory) => `import { ${factory.name} as ${factory.local} } from ${quote(factory.from)}`
      )
    )
  }
  lines.push('')
  for (const [routerIndex, router] of routers.entries()) {
    let procedureIndex = 0
    for (const [name, procedure] of Object.entries(router.value)) {
      if (!procedure?.$meta?.route) continue
      procedureIndex += 1
      const route = contract.routes[router.name]?.[name]
      const contractType = `typeof httpContract.routes[${quote(router.name)}][${quote(name)}]`
      if (route?.input?.kind === 'tuple') {
        for (const inputIndex of route.input.items.keys()) {
          lines.push(
            `type Router${routerIndex + 1}Procedure${procedureIndex}Input${inputIndex + 1} = HTTPWireInput<${contractType}['input']['items'][${inputIndex}]>`
          )
        }
      } else if (route?.input?.kind === 'value') {
        lines.push(
          `type Router${routerIndex + 1}Procedure${procedureIndex}Input = HTTPWireInput<${contractType}['input']['wire']>`
        )
      }
      lines.push(
        `type Router${routerIndex + 1}Procedure${procedureIndex}Output = ${route?.output ? `HTTPWireOutput<${contractType}['output']>` : 'unknown'}`
      )
    }
  }
  lines.push('', 'export function createLocalClient(transport: HttpTransport) {')
  for (const [index, expressions] of routerPlugins.entries()) {
    lines.push(`  const api${index + 1} = createApi({ plugins: [${expressions.join(', ')}] as const })`)
  }
  lines.push('  return {')
  for (const [index, router] of routers.entries()) {
    lines.push(`    ${quote(router.name)}: api${index + 1}.router(${quote(router.name)}).define(({ procedure }) => ({`)
    let procedureIndex = 0
    for (const [name, procedure] of Object.entries(router.value)) {
      const route = procedure?.$meta?.route
      if (!route) continue
      procedureIndex += 1
      const tupleInput = isInputTupleSchema(procedure.$meta.input)
      const typePrefix = `Router${index + 1}Procedure${procedureIndex}`
      const output = `${typePrefix}Output`
      const routeExpression = `httpContract.routes[${quote(router.name)}][${quote(name)}]`
      const callArgs = procedure.$meta.input === undefined ? '' : tupleInput ? ', ...input' : ', input'
      const call = `transport.call<${output}>(${routeExpression}${callArgs})`
      const request = `transport.request<${output}>(${routeExpression}, options${callArgs})`
      const inputBuilder = tupleInput
        ? `procedure.input(${procedure.$meta.input['hulla.api.inputSchemas']
            .map((_: unknown, inputIndex: number) => `clientSchema<${typePrefix}Input${inputIndex + 1}>()`)
            .join(', ')})`
        : `procedure.input(clientSchema<${typePrefix}Input>())`
      const builder =
        procedure.$meta.input === undefined
          ? `procedure.output(clientSchema<${output}>()).handler(() => ${call})`
          : `${inputBuilder}.output(clientSchema<${output}>()).handler(({ input }) => ${call})`
      const requestHandler =
        procedure.$meta.input === undefined ? `(options) => ${request}` : `(options, ...input) => ${request}`
      lines.push(`      ${quote(name)}: clientProcedure(${builder}, ${requestHandler}),`)
    }
    lines.push('    })),')
  }
  lines.push('  }', '}', '')
  return lines.join('\n')
}

function remapGeneratedPaths(
  source: APISourceGenerateResult,
  temporaryDir: string,
  outputDir: string
): APISourceGenerateResult {
  return {
    ...source,
    ...(source.outputs === undefined
      ? {}
      : {
          outputs: Object.fromEntries(
            Object.entries(source.outputs).map(([name, path]) => [name, remapPath(path, temporaryDir, outputDir)])
          ),
        }),
  }
}

function remapPath(path: string, temporaryDir: string, outputDir: string): string {
  return path === temporaryDir || path.startsWith(`${temporaryDir}/`)
    ? `${outputDir}${path.slice(temporaryDir.length)}`
    : path
}

function generateServerIndexCode(sources: readonly APISourceGenerateResult[]): string {
  const serverSources = sources.filter(
    (source): source is APISourceGenerateResult & { server: NonNullable<APISourceGenerateResult['server']> } =>
      source.server !== undefined
  )
  const contractSources = sources.filter(
    (source): source is APISourceGenerateResult & { contract: NonNullable<APISourceGenerateResult['contract']> } =>
      source.contract !== undefined
  )
  const lines: string[] = contractSources.map(
    (source, index) =>
      `import { ${source.contract.exportName} as contract${index + 1} } from ${quote(source.contract.importPath)}`
  )
  if (!serverSources.some((source) => source.name === 'routes')) lines.push('export const routers = [] as const')

  const generatedSources = serverSources.filter((source) => source.name !== 'routes')
  for (const source of serverSources) {
    const generatedIndex = generatedSources.indexOf(source)
    const suffix = source.name === 'routes' || generatedSources.length === 1 ? '' : `${generatedIndex + 1}`
    const exportedFactory =
      suffix === ''
        ? source.server.factoryName
        : `${source.server.factoryName} as ${source.server.factoryName}${suffix}`
    lines.push(`export { ${exportedFactory} } from ${quote(source.server.importPath)}`)
  }

  lines.push(
    `export const contracts = { ${contractSources
      .map((source, index) => `${quote(source.name)}: contract${index + 1}`)
      .join(', ')} } as const`
  )

  return `${lines.join('\n')}\n`
}

function generateIndexCode(sources: readonly APISourceGenerateResult[]): string {
  const clientSources = sources.filter(isClientSource)
  const collections = collectGeneratedCollections(sources)
  const hasOpenAPI = clientSources.some((source) => source.transport !== 'http')
  const hasHTTP = clientSources.some((source) => source.transport === 'http')
  const lines = [
    ...(hasOpenAPI ? ["import { createFetchOpenAPIClient } from './fetch'"] : []),
    ...(hasHTTP ? ["import { createHttpTransport } from '@hulla/api/client'"] : []),
    "import type { ClientHeaders } from '@hulla/api/client'",
    ...(collections.length > 0
      ? [
          "import { createCollection } from '@tanstack/db'",
          "import type { QueryClient } from '@tanstack/query-core'",
          "import { createCollectionRuntime, crudCollectionOptions } from '@hulla/api-tanstack-db'",
          "import type { CrudCollectionOptions } from '@hulla/api-tanstack-db'",
        ]
      : []),
    "export { HullaAPIError } from '@hulla/api/client'",
    "export type { FetchOpenAPIClient, FetchOpenAPIClientOptions, OpenAPIRequest } from './fetch'",
  ]

  for (const [index, source] of clientSources.entries()) {
    lines.push(`import { ${source.factoryName} as createSource${index + 1} } from ${quote(source.importPath)}`)
  }

  lines.push(
    '',
    'type ClientTransportOptions = {',
    '  baseUrl?: string',
    '  fetch?: typeof fetch',
    '  headers?: ClientHeaders',
    '  serializeQuery?: (query: unknown) => string',
    '}',
    ''
  )
  lines.push('function createClientRoutes(options: ClientTransportOptions = {}) {')
  if (hasOpenAPI) lines.push('  const fetchClient = createFetchOpenAPIClient(options)')

  for (const [index, source] of clientSources.entries()) {
    const baseUrl = source.baseUrl ?? ''
    lines.push(
      source.transport === 'http'
        ? `  const source${index + 1} = createSource${index + 1}(createHttpTransport({ ...options, baseUrl: joinBaseUrl(options.baseUrl ?? "", ${quote(baseUrl)}) }))`
        : `  const source${index + 1} = createSource${index + 1}(fetchClient.withBaseUrl(${quote(baseUrl)}))`
    )
  }

  lines.push(`  assertNoSourceCollisions([${clientSources.map((_, index) => `source${index + 1}`).join(', ')}])`)
  const assignedSources = clientSources.map((_, index) => `source${index + 1}`).join(', ')
  lines.push(`  return ${assignedSources.length === 0 ? '{}' : `Object.assign({}, ${assignedSources})`}`)
  lines.push('}')
  lines.push('')
  lines.push('function joinBaseUrl(left: string, right: string): string {')
  lines.push('  if (right.length === 0) return left')
  lines.push('  if (/^https?:\\/\\//.test(right)) return right')
  lines.push('  return `${left.replace(/\\/+$/, "")}/${right.replace(/^\\/+/, "")}`')
  lines.push('}')
  lines.push('')
  lines.push('export type ClientRoutes = ReturnType<typeof createClientRoutes>')
  lines.push('')
  if (collections.length > 0) {
    lines.push(...generateCollectionsCode(collections))
  } else {
    lines.push('export type CreateClientOptions = ClientTransportOptions')
    lines.push('')
    lines.push('export function createClient(options: CreateClientOptions = {}) {')
    lines.push('  return createClientRoutes(options)')
    lines.push('}')
    lines.push('')
    lines.push('export type Client = ReturnType<typeof createClient>')
    lines.push('')
  }
  lines.push('function assertNoSourceCollisions(sources: readonly object[]): void {')
  lines.push('  const keys = new Set<string>()')
  lines.push('')
  lines.push('  for (const source of sources) {')
  lines.push('    for (const key of Object.keys(source)) {')
  lines.push('      if (keys.has(key)) throw new Error(`API sources collide on root key "${key}"`)')
  lines.push('      keys.add(key)')
  lines.push('    }')
  lines.push('  }')
  lines.push('}')
  lines.push('')

  return lines.join('\n')
}

function collectGeneratedCollections(sources: readonly APISourceGenerateResult[]): APIGeneratedCollection[] {
  const collections: APIGeneratedCollection[] = []
  const routers = new Set<string>()

  for (const collection of sources.flatMap((source) => source.collections ?? [])) {
    if (routers.has(collection.router)) {
      throw new Error(`Generated TanStack DB collections collide on router "${collection.router}".`)
    }
    routers.add(collection.router)
    collections.push(collection)
  }

  return collections
}

function generateCollectionsCode(collections: readonly APIGeneratedCollection[]): string[] {
  const lines = [
    'export type GeneratedCollectionOverrides = {',
    ...collections.map(
      (collection) =>
        `  ${quote(collection.router)}?: Omit<CrudCollectionOptions<ClientRoutes[${quote(collection.router)}], ${quote(collection.key)}>, "routes" | "key" | "queryClient">`
    ),
    '}',
    '',
    'export type CreateCollectionOptions = {',
    '  queryClient: QueryClient',
    '  client: ClientRoutes',
    '  overrides?: GeneratedCollectionOverrides',
    '}',
    '',
    'export type CreateClientOptions = ClientTransportOptions & {',
    '  queryClient: QueryClient',
    '  collections?: GeneratedCollectionOverrides',
    '}',
    '',
    'export function createCollectionOptions(options: CreateCollectionOptions) {',
    '  const client = options.client',
    '  return {',
  ]
  for (const collection of collections) {
    lines.push(
      `    ${quote(collection.router)}: crudCollectionOptions({`,
      `      ...options.overrides?.[${quote(collection.router)}],`,
      `      routes: client[${quote(collection.router)}],`,
      `      key: ${quote(collection.key)},`,
      '      queryClient: options.queryClient,',
      '    }),'
    )
  }
  lines.push(
    '  }',
    '}',
    '',
    'function createGeneratedCollectionRuntime(options: CreateCollectionOptions) {',
    '  const client = options.client',
    '  return createCollectionRuntime({'
  )
  for (const collection of collections) {
    lines.push(
      `    ${quote(collection.router)}: () => {`,
      '      const generated = crudCollectionOptions({',
      `        ...options.overrides?.[${quote(collection.router)}],`,
      `        routes: client[${quote(collection.router)}],`,
      `        key: ${quote(collection.key)},`,
      '        queryClient: options.queryClient,',
      '      })',
      '      return Object.assign(createCollection(generated), { create: generated.create })',
      '    },'
    )
  }
  lines.push(
    '  })',
    '}',
    '',
    'export function createClient(options: CreateClientOptions) {',
    '  const { queryClient, collections: overrides, ...clientOptions } = options',
    '  const client = createClientRoutes(clientOptions)',
    '  assertNoClientMemberCollisions(client)',
    '  const runtime = createGeneratedCollectionRuntime({ client, queryClient, overrides })',
    '  return Object.assign(client, {'
  )
  for (const collection of collections) {
    const namespace = `$${collection.namespace ?? 'tanstack'}`
    lines.push(
      `    ${quote(collection.router)}: Object.assign(client[${quote(collection.router)}], {`,
      `      ${quote(namespace)}: {`,
      `        get collection() { return runtime.collections[${quote(collection.router)}] },`,
      '      },',
      '    }),'
    )
  }
  lines.push(
    '    $dispose: runtime.dispose,',
    '  })',
    '}',
    '',
    'export type Client = ReturnType<typeof createClient>',
    '',
    'function assertNoClientMemberCollisions(client: ClientRoutes): void {',
    '  if ("$dispose" in client) throw new Error(`Generated client router "$dispose" collides with a client runtime member.`)'
  )
  for (const collection of collections) {
    const namespace = `$${collection.namespace ?? 'tanstack'}`
    lines.push(
      `  if (${quote(namespace)} in client[${quote(collection.router)}]) throw new Error(${quote(
        `Generated client route "${collection.router}.${namespace}" collides with the TanStack collection namespace.`
      )})`
    )
  }
  lines.push('}', '')
  return lines
}

function isClientSource(source: APISourceGenerateResult): source is APISourceGenerateResult & {
  importPath: string
  factoryName: string
} {
  return source.importPath !== undefined && source.factoryName !== undefined
}

export function relativeImport(fromDir: string, toFileOrDir: string): string {
  const value = relative(fromDir, toFileOrDir)
    .replace(/\\/g, '/')
    .replace(/\.(?:[cm]?[jt]sx?)$/, '')
    .replace(/\/index$/, '')

  return value.startsWith('.') ? value : `./${value}`
}

export function serializeGenerationOptions(value: unknown): string {
  assertSerializable(value, new Set())
  const serialized = JSON.stringify(value)
  if (serialized === undefined) throw new Error('Generation options are not JSON-serializable.')
  return serialized
}

function assertSerializable(value: unknown, seen: Set<object>): void {
  if (value === null || typeof value === 'string' || typeof value === 'boolean') return
  if (typeof value === 'number') {
    if (Number.isFinite(value)) return
    throw new Error('Generation options cannot contain non-finite numbers.')
  }
  if (typeof value !== 'object') throw new Error(`Generation options cannot contain ${typeof value} values.`)
  if (seen.has(value)) throw new Error('Generation options cannot contain cycles.')
  const prototype = Object.getPrototypeOf(value) as unknown
  if (!Array.isArray(value) && prototype !== Object.prototype && prototype !== null) {
    throw new Error('Generation options can contain only plain objects and arrays.')
  }
  seen.add(value)
  try {
    if (Array.isArray(value)) {
      for (const item of value) assertSerializable(item, seen)
    } else {
      for (const item of Object.values(value)) assertSerializable(item, seen)
    }
  } finally {
    seen.delete(value)
  }
}

function assertSafeSourceName(name: string): void {
  if (!/^[a-zA-Z0-9][a-zA-Z0-9_-]*$/.test(name)) {
    throw new Error(`API source name "${name}" must contain only letters, numbers, underscores, and hyphens.`)
  }
}

function quote(value: string): string {
  return JSON.stringify(value)
}
