import { existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync, symlinkSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { pathToFileURL } from 'node:url'
import { afterEach, describe, expect, test } from 'vitest'
import { generate, runGenerateConfig, serializeGenerationOptions, type APISource } from '../src'
import { HullaAPIError } from '../src/client'

const tempDirs: string[] = []

function createTempDir() {
  const dir = mkdtempSync(join(tmpdir(), 'hulla-api-core-'))
  tempDirs.push(dir)

  return dir
}

function routerModule(name: string): string {
  return [
    `const route = { call() {}, $meta: { type: 'procedure', name: 'list', router: '${name}', route: { method: 'GET', path: '/' } } }`,
    `export const router = { list: route }`,
    `Object.defineProperty(router, Symbol.for('hulla.api.router-definition'), { value: { name: '${name}', api: { plugins: { list: [] } } } })`,
    '',
  ].join('\n')
}

afterEach(() => {
  for (const dir of tempDirs.splice(0)) {
    rmSync(dir, { recursive: true, force: true })
  }
})

describe('client generation config', () => {
  test('discovers router modules and emits only exposed routes', async () => {
    const cwd = createTempDir()
    const routerPath = join(cwd, 'src/api/todos.router.mjs')
    mkdirSync(join(cwd, 'src/api'), { recursive: true })
    writeFileSync(
      routerPath,
      [
        "const exposed = { call() {}, $meta: { type: 'procedure', name: 'list', router: 'todos', route: { method: 'GET', path: '/' } } }",
        "const internal = { call() {}, $meta: { type: 'procedure', name: 'internal', router: 'todos' } }",
        'export const todosRouter = { list: exposed, internal }',
        "Object.defineProperty(todosRouter, Symbol.for('hulla.api.router-definition'), { value: { name: 'todos', api: { plugins: { list: [] } } } })",
        '',
      ].join('\n')
    )

    const result = await runGenerateConfig(generate({ output: { dir: './generated' } }), { cwd })
    const client = readFileSync(join(result.outputDir, 'routes.ts'), 'utf8')
    const server = readFileSync(join(result.outputDir, 'routes.server.ts'), 'utf8')
    const contract = JSON.parse(readFileSync(join(result.outputDir, 'routes.contract.json'), 'utf8'))

    expect(client).toContain('type Router1Procedure1Output = unknown')
    expect(client).not.toContain('ServerRouter')
    expect(client).not.toContain('typeof import(')
    expect(client).not.toContain(routerPath)
    expect(client).toContain('transport.call<Router1Procedure1Output>(httpContract.routes["todos"]["list"])')
    expect(client).toContain(
      'transport.request<Router1Procedure1Output>(httpContract.routes["todos"]["list"], options)'
    )
    expect(server).toContain('export const routers')
    expect(contract).toMatchObject({
      version: 1,
      basePath: '/api',
      routes: {
        todos: { list: { router: 'todos', procedure: 'list', method: 'GET', path: '/todos' } },
      },
    })
    expect(readFileSync(join(result.outputDir, 'routes.contract.ts'), 'utf8')).toContain('satisfies HTTPContract')
    expect(JSON.parse(readFileSync(join(result.outputDir, '.hulla/manifest.json'), 'utf8'))).toEqual({ version: 1 })
    expect(readFileSync(join(result.outputDir, 'server.ts'), 'utf8')).toContain(
      'export const contracts = { "routes": contract1 }'
    )
  })

  test('generates configured collections for hand-written CRUD routers', async () => {
    const cwd = createTempDir()
    mkdirSync(join(cwd, 'src/api'), { recursive: true })
    writeFileSync(
      join(cwd, 'src/api/todos.router.mjs'),
      [
        `const procedure = (name, method, path) => ({ call() {}, $meta: { type: 'procedure', name, router: 'todos', route: { method, path } } })`,
        `const plugin = { id: 'tanstackDb', generation: { from: '@hulla/api-tanstack-db', name: 'tanstackDbPlugin', options: { collections: { todos: 'id' } } } }`,
        `export const todos = { list: procedure('list', 'GET', '/'), create: procedure('create', 'POST', '/'), update: procedure('update', 'PATCH', '/:id'), delete: procedure('delete', 'DELETE', '/:id') }`,
        `Object.defineProperty(todos, Symbol.for('hulla.api.router-definition'), { value: { name: 'todos', api: { plugins: { list: [plugin] } } } })`,
        '',
      ].join('\n')
    )

    const result = await runGenerateConfig(generate({ output: { dir: './generated' } }), { cwd })
    const client = readFileSync(join(result.outputDir, 'index.ts'), 'utf8')

    expect(result.sources[0]?.collections).toEqual([{ router: 'todos', key: 'id' }])
    expect(client).toContain('export function createClient(options: CreateClientOptions)')
    expect(client).toContain('routes: client["todos"]')
  })

  test('generates collections from router preset metadata when TanStack DB is installed', async () => {
    const cwd = createTempDir()
    mkdirSync(join(cwd, 'src/api'), { recursive: true })
    writeFileSync(
      join(cwd, 'src/api/todos.router.mjs'),
      [
        `const procedure = (name, method, path) => ({ call() {}, $meta: { type: 'procedure', name, router: 'todos', route: { method, path } } })`,
        `const drizzle = { id: 'drizzle', target: 'server' }`,
        `const plugin = { id: 'tanstackDb', generation: { from: '@hulla/api-tanstack-db', name: 'tanstackDbPlugin', options: {} } }`,
        `export const todos = { list: procedure('list', 'GET', '/'), create: procedure('create', 'POST', '/'), update: procedure('update', 'PATCH', '/:id'), delete: procedure('delete', 'DELETE', '/:id') }`,
        `Object.defineProperty(todos, Symbol.for('hulla.api.router-definition'), { value: { name: 'todos', api: { plugins: { list: [drizzle, plugin] } }, generation: { collection: { key: 'id' } } } })`,
        '',
      ].join('\n')
    )

    const result = await runGenerateConfig(generate({ output: { dir: './generated' } }), { cwd })
    const client = readFileSync(join(result.outputDir, 'routes.ts'), 'utf8')

    expect(result.sources[0]?.collections).toEqual([{ router: 'todos', key: 'id' }])
    expect(client).toContain('@hulla/api-tanstack-db')
    expect(client).not.toContain('@hulla/api-drizzle')
    expect(client).not.toContain('drizzlePlugin')
  })

  test('can disable collections inferred from router preset metadata', async () => {
    const cwd = createTempDir()
    mkdirSync(join(cwd, 'src/api'), { recursive: true })
    writeFileSync(
      join(cwd, 'src/api/todos.router.mjs'),
      [
        `const procedure = (name, method, path) => ({ call() {}, $meta: { type: 'procedure', name, router: 'todos', route: { method, path } } })`,
        `const plugin = { id: 'tanstackDb', generation: { from: '@hulla/api-tanstack-db', name: 'tanstackDbPlugin', options: { collections: false } } }`,
        `export const todos = { list: procedure('list', 'GET', '/'), create: procedure('create', 'POST', '/'), update: procedure('update', 'PATCH', '/:id'), delete: procedure('delete', 'DELETE', '/:id') }`,
        `Object.defineProperty(todos, Symbol.for('hulla.api.router-definition'), { value: { name: 'todos', api: { plugins: { list: [plugin] } }, generation: { collection: { key: 'id' } } } })`,
        '',
      ].join('\n')
    )

    const result = await runGenerateConfig(generate({ output: { dir: './generated' } }), { cwd })

    expect(result.sources[0]?.collections).toBeUndefined()
  })

  test('lets explicit TanStack DB collection keys override router preset metadata', async () => {
    const cwd = createTempDir()
    mkdirSync(join(cwd, 'src/api'), { recursive: true })
    writeFileSync(
      join(cwd, 'src/api/todos.router.mjs'),
      [
        `const procedure = (name, method, path) => ({ call() {}, $meta: { type: 'procedure', name, router: 'todos', route: { method, path } } })`,
        `const plugin = { id: 'tanstackDb', generation: { from: '@hulla/api-tanstack-db', name: 'tanstackDbPlugin', options: { collections: { todos: 'slug' } } } }`,
        `export const todos = { list: procedure('list', 'GET', '/'), create: procedure('create', 'POST', '/'), update: procedure('update', 'PATCH', '/:id'), delete: procedure('delete', 'DELETE', '/:id') }`,
        `Object.defineProperty(todos, Symbol.for('hulla.api.router-definition'), { value: { name: 'todos', api: { plugins: { list: [plugin] } }, generation: { collection: { key: 'id' } } } })`,
        '',
      ].join('\n')
    )

    const result = await runGenerateConfig(generate({ output: { dir: './generated' } }), { cwd })

    expect(result.sources[0]?.collections).toEqual([{ router: 'todos', key: 'slug' }])
  })

  test('rejects plugin generation options that JSON would silently discard', () => {
    expect(() => serializeGenerationOptions({ callback: () => true })).toThrow('function')
    const cyclic: Record<string, unknown> = {}
    cyclic['self'] = cyclic
    expect(() => serializeGenerationOptions(cyclic)).toThrow('cycles')
  })

  test('matches globstar includes against direct and nested router files', async () => {
    const cwd = createTempDir()
    mkdirSync(join(cwd, 'src/api/nested'), { recursive: true })
    writeFileSync(join(cwd, 'src/api/root.router.mjs'), routerModule('root'))
    writeFileSync(join(cwd, 'src/api/nested/child.router.mjs'), routerModule('child'))
    writeFileSync(join(cwd, 'src/api/nested/ignored.router.mjs'), routerModule('ignored'))

    const result = await runGenerateConfig(
      generate({
        output: { dir: './generated' },
        routers: {
          include: ['src/api/**/*.{router,route}.mjs'],
          exclude: ['**/ignored.router.mjs'],
        },
      }),
      { cwd }
    )
    const contract = JSON.parse(readFileSync(join(result.outputDir, 'routes.contract.json'), 'utf8'))

    expect(Object.keys(contract.routes)).toEqual(['child', 'root'])
  })

  test('derives input contracts with registered schema converters and rejects opaque schemas', async () => {
    const cwd = createTempDir()
    mkdirSync(join(cwd, 'src/api'), { recursive: true })
    writeFileSync(
      join(cwd, 'src/api/values.router.mjs'),
      [
        "const input = { marker: 'number', parse(value) { return value }, _input: undefined, _output: undefined }",
        "const read = { call() {}, $meta: { type: 'procedure', name: 'read', router: 'values', route: { method: 'GET', path: '/:id' }, input, output: input } }",
        'export const values = { read }',
        "Object.defineProperty(values, Symbol.for('hulla.api.router-definition'), { value: { name: 'values', api: { plugins: { list: [] } } } })",
        '',
      ].join('\n')
    )

    await expect(runGenerateConfig(generate({ output: { dir: './opaque' } }), { cwd })).rejects.toThrow('httpWire')
    const result = await runGenerateConfig(
      generate({
        output: { dir: './generated' },
        schemaConverters: [
          {
            supports: (schema) => (schema as unknown as { marker?: string }).marker === 'number',
            convert: () => ({ kind: 'number' as const }),
          },
        ],
      }),
      { cwd }
    )
    const contract = JSON.parse(readFileSync(join(result.outputDir, 'routes.contract.json'), 'utf8'))
    const client = readFileSync(join(result.outputDir, 'routes.ts'), 'utf8')

    expect(contract.routes.values.read.input).toEqual({ kind: 'value', wire: { kind: 'number' } })
    expect(contract.routes.values.read.output).toEqual({ kind: 'number' })
    expect(client).toContain('type Router1Procedure1Input = HTTPWireInput<')
    expect(client).toContain('type Router1Procedure1Output = HTTPWireOutput<')
    expect(client).not.toContain('src/api/values.router.mjs')
  })
  test('runs sources and writes generated client entry files', async () => {
    const cwd = createTempDir()
    const source: APISource = {
      name: 'app',
      async generate() {
        return {
          name: 'app',
          baseUrl: '/api',
          importPath: './sources/app',
          factoryName: 'createOpenAPIClient',
        }
      },
    }

    const result = await runGenerateConfig(
      generate({
        sources: [source],
        output: {
          dir: './src/api/generated',
          entry: './src/api/index.ts',
        },
      }),
      { cwd }
    )

    expect(existsSync(join(result.outputDir, 'index.ts'))).toBe(true)
    expect(existsSync(join(result.outputDir, 'fetch.ts'))).toBe(true)
    expect(existsSync(join(cwd, 'src/api/index.ts'))).toBe(true)
    const generatedIndex = readFileSync(join(result.outputDir, 'index.ts'), 'utf8')
    expect(generatedIndex).toContain('export function createClient(options: CreateClientOptions = {})')
    expect(generatedIndex).toContain('return createClientRoutes(options)')
    expect(generatedIndex).not.toContain('export const api')
    expect(generatedIndex).not.toContain('export function createApi')
    expect(readFileSync(join(result.outputDir, 'index.ts'), 'utf8')).toContain(
      "export { HullaAPIError } from '@hulla/api/client'"
    )
    expect(readFileSync(join(cwd, 'src/api/index.ts'), 'utf8')).toBe("export * from './generated'\n")
  })

  test('generates a lazy TanStack DB client runtime from source metadata', async () => {
    const cwd = createTempDir()
    const source: APISource = {
      name: 'database',
      generate() {
        return {
          name: 'database',
          baseUrl: '/api',
          importPath: './sources/database',
          factoryName: 'createDatabaseClient',
          transport: 'http' as const,
          collections: [{ router: 'todos', key: 'id' }],
        }
      },
    }

    const result = await runGenerateConfig(generate({ sources: [source], output: { dir: './generated' } }), { cwd })
    const client = readFileSync(join(result.outputDir, 'index.ts'), 'utf8')

    expect(client).toContain("import { createCollection } from '@tanstack/db'")
    expect(client).toContain("import { createCollectionRuntime, crudCollectionOptions } from '@hulla/api-tanstack-db'")
    expect(client).toContain('queryClient: QueryClient')
    expect(client).toContain(
      '"todos"?: Omit<CrudCollectionOptions<ClientRoutes["todos"], "id">, "routes" | "key" | "queryClient">'
    )
    expect(client).toContain('export function createCollectionOptions(options: CreateCollectionOptions)')
    expect(client).toContain('...options.overrides?.["todos"]')
    expect(client).toContain('routes: client["todos"]')
    expect(client).toContain('export function createClient(options: CreateClientOptions)')
    expect(client).toContain('const { queryClient, collections: overrides, ...clientOptions } = options')
    expect(client).toContain('const client = createClientRoutes(clientOptions)')
    expect(client).toContain('const runtime = createGeneratedCollectionRuntime({ client, queryClient, overrides })')
    expect(client).toContain('"todos": Object.assign(client["todos"], {')
    expect(client).toContain('get collection() { return runtime.collections["todos"] }')
    expect(client).toContain('$dispose: runtime.dispose')
    expect(client).toContain('if ("$dispose" in client) throw new Error')
    expect(client).toContain('"todos": () => {')
    expect(client).toContain('return Object.assign(createCollection(generated), { create: generated.create })')
  })

  test('uses the configured TanStack DB namespace for generated collections', async () => {
    const cwd = createTempDir()
    const source: APISource = {
      name: 'database',
      generate: () => ({
        name: 'database',
        importPath: './sources/database',
        factoryName: 'createDatabaseClient',
        transport: 'http',
        collections: [{ router: 'todos', key: 'id', namespace: 'db' }],
      }),
    }

    const result = await runGenerateConfig(generate({ sources: [source], output: { dir: './generated' } }), { cwd })
    const client = readFileSync(join(result.outputDir, 'index.ts'), 'utf8')

    expect(client).toContain('"$db": {')
    expect(client).toContain('Generated client route \\"todos.$db\\" collides')
  })

  test('rejects colliding generated collections from multiple sources', async () => {
    const cwd = createTempDir()
    const source = (name: string): APISource => ({
      name,
      generate: () => ({ name, collections: [{ router: 'todos', key: 'id' }] }),
    })

    await expect(
      runGenerateConfig(generate({ sources: [source('one'), source('two')], output: { dir: './generated' } }), {
        cwd,
      })
    ).rejects.toThrow('collections collide on router "todos"')
  })

  test('publishes generated output atomically and preserves the last good result', async () => {
    const cwd = createTempDir()
    const good: APISource = {
      name: 'database',
      generate: () => ({
        name: 'database',
        importPath: './sources/database',
        factoryName: 'createClient',
        transport: 'http',
        server: {
          importPath: './sources/database/server',
          factoryName: 'createDrizzleRouters',
        },
      }),
    }
    await runGenerateConfig(generate({ sources: [good], output: { dir: './generated' } }), { cwd })
    const before = readFileSync(join(cwd, 'generated/index.ts'), 'utf8')

    await expect(
      runGenerateConfig(
        generate({
          sources: [
            {
              name: 'failure',
              generate() {
                throw new Error('generation failed')
              },
            },
          ],
          output: { dir: './generated' },
        }),
        { cwd }
      )
    ).rejects.toThrow('generation failed')

    expect(readFileSync(join(cwd, 'generated/index.ts'), 'utf8')).toBe(before)
    expect(readFileSync(join(cwd, 'generated/server.ts'), 'utf8')).toContain('createDrizzleRouters')
  })

  test('rejects unsafe or unowned output locations before replacing files', async () => {
    const cwd = createTempDir()
    writeFileSync(join(cwd, 'sentinel.txt'), 'keep')

    await expect(runGenerateConfig(generate({ output: { dir: '.' } }), { cwd })).rejects.toThrow(
      'must be inside the project directory'
    )
    await expect(runGenerateConfig(generate({ output: { dir: '../outside' } }), { cwd })).rejects.toThrow(
      'must be inside the project directory'
    )
    expect(readFileSync(join(cwd, 'sentinel.txt'), 'utf8')).toBe('keep')

    mkdirSync(join(cwd, 'unowned'))
    writeFileSync(join(cwd, 'unowned/notes.txt'), 'keep')
    await expect(runGenerateConfig(generate({ output: { dir: './unowned' } }), { cwd })).rejects.toThrow(
      'Refusing to replace unowned'
    )
    expect(readFileSync(join(cwd, 'unowned/notes.txt'), 'utf8')).toBe('keep')

    mkdirSync(join(cwd, 'target'))
    symlinkSync(join(cwd, 'target'), join(cwd, 'linked'), 'dir')
    await expect(runGenerateConfig(generate({ output: { dir: './linked' } }), { cwd })).rejects.toThrow('symbolic link')

    mkdirSync(join(cwd, 'marker-target'))
    writeFileSync(join(cwd, 'marker-target/manifest.json'), '{"version":1}')
    mkdirSync(join(cwd, 'marker-linked'))
    symlinkSync(join(cwd, 'marker-target'), join(cwd, 'marker-linked/.hulla'), 'dir')
    await expect(runGenerateConfig(generate({ output: { dir: './marker-linked' } }), { cwd })).rejects.toThrow(
      'manifest directory is not a regular directory'
    )

    await expect(
      runGenerateConfig(generate({ output: { dir: './generated', entry: './generated/client.ts' } }), { cwd })
    ).rejects.toThrow('entry must be outside')
  })

  test('restores the owned output when entry publication fails after promotion', async () => {
    const cwd = createTempDir()
    const config = generate({ output: { dir: './generated' } })
    await runGenerateConfig(config, { cwd })
    const before = readFileSync(join(cwd, 'generated/index.ts'), 'utf8')
    const sabotage: APISource = {
      name: 'sabotage',
      generate() {
        writeFileSync(join(cwd, 'blocked'), 'not a directory')
        return { name: 'sabotage' }
      },
    }

    await expect(
      runGenerateConfig(
        generate({ sources: [sabotage], output: { dir: './generated', entry: './blocked/index.ts' } }),
        { cwd }
      )
    ).rejects.toThrow()

    expect(readFileSync(join(cwd, 'generated/index.ts'), 'utf8')).toBe(before)
    expect(JSON.parse(readFileSync(join(cwd, 'generated/.hulla/manifest.json'), 'utf8'))).toEqual({ version: 1 })
  })

  test('allows generation-only sources before client sources', async () => {
    const cwd = createTempDir()
    const generationOnlySource: APISource = {
      name: 'api',
      generate() {
        return {
          name: 'api',
          outputs: {
            openapi: join(cwd, 'openapi.json'),
          },
        }
      },
    }
    const clientSource: APISource = {
      name: 'web',
      generate(context) {
        expect(context.sources[0]?.outputs?.['openapi']).toBe(join(cwd, 'openapi.json'))

        return {
          name: 'web',
          importPath: './sources/web',
          factoryName: 'createOpenAPIClient',
        }
      },
    }

    const result = await runGenerateConfig(
      generate({
        sources: [generationOnlySource, clientSource],
        output: {
          dir: './src/api/generated',
        },
      }),
      { cwd }
    )
    const index = readFileSync(join(result.outputDir, 'index.ts'), 'utf8')

    expect(index).not.toContain('./sources/api')
    expect(index).toContain('./sources/web')
  })

  test('generates an interoperable fetch client with structured errors', async () => {
    const cwd = createTempDir()
    const result = await runGenerateConfig(
      generate({
        sources: [],
        output: {
          dir: './generated',
        },
      }),
      { cwd }
    )
    const fetchPath = join(result.outputDir, 'fetch.ts')
    writeFileSync(
      fetchPath,
      readFileSync(fetchPath, 'utf8').replaceAll(
        "'@hulla/api/client'",
        JSON.stringify(new URL('../src/client.ts', import.meta.url).href)
      )
    )
    const module = (await import(pathToFileURL(fetchPath).href)) as typeof import('../src/generate') & {
      HullaAPIError: typeof HullaAPIError
      createFetchOpenAPIClient: (options: {
        baseUrl?: string
        fetch?: typeof fetch
        headers?: HeadersInit
        serializeQuery?: (query: unknown) => string
      }) => <T>(request: unknown) => Promise<T>
    }
    let capturedRequest: Request | undefined
    const client = module.createFetchOpenAPIClient({
      baseUrl: 'https://example.com',
      headers: { authorization: 'Bearer token' },
      fetch: async (input, init) => {
        capturedRequest = new Request(input, init)
        return new Response('created', {
          status: 201,
          headers: { 'content-type': 'text/plain' },
        })
      },
      serializeQuery: () => 'tag=a&tag=b',
    })

    await expect(
      client<string>({
        method: 'POST',
        path: '/todos',
        query: { ignored: true },
        body: { title: 'Ship it' },
      })
    ).resolves.toBe('created')
    expect(capturedRequest?.url).toBe('https://example.com/todos?tag=a&tag=b')
    expect(capturedRequest?.headers.get('authorization')).toBe('Bearer token')
    expect(capturedRequest?.headers.get('content-type')).toBe('application/json')

    const failingClient = module.createFetchOpenAPIClient({
      fetch: async () =>
        new Response(JSON.stringify({ code: 'bad_request' }), {
          status: 400,
          statusText: 'Bad Request',
          headers: { 'content-type': 'application/problem+json' },
        }),
    })
    const error = await failingClient({ method: 'GET', path: '/failure' }).catch((reason: unknown) => reason)

    expect(error).toBeInstanceOf(module.HullaAPIError)
    expect(error).toBeInstanceOf(HullaAPIError)
    expect(error).toMatchObject({
      body: { code: 'bad_request' },
      response: expect.objectContaining({ status: 400 }),
    })
  })

  test('rejects duplicate and unsafe source names', async () => {
    const cwd = createTempDir()
    const source = (name: string): APISource => ({
      name,
      generate: () => ({ name }),
    })

    await expect(
      runGenerateConfig(generate({ sources: [source('same'), source('same')], output: { dir: './generated' } }), {
        cwd,
      })
    ).rejects.toThrow('Duplicate API source name "same"')
    await expect(
      runGenerateConfig(generate({ sources: [source('../escape')], output: { dir: './generated' } }), { cwd })
    ).rejects.toThrow('must contain only')
  })
})
