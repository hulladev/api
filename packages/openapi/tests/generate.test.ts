import { existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs'
import { dirname, join, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'
import type { APIPlugin } from '@hulla/api'
import ts from 'typescript'
import { afterEach, describe, expect, test } from 'vitest'
import { openapi, generate, generateCode, type OpenAPIDocument } from '../src'
import { openAPIFixture } from './fixtures/openapi.fixture'

const testDir = dirname(fileURLToPath(import.meta.url))
const generatedRoot = resolve(testDir, '.generated')
const tempDirs: string[] = []

function queryPlugin(options?: unknown): APIPlugin {
  return {
    id: 'tanstackQuery',
    generation: {
      from: '@hulla/api-tanstack-query',
      name: 'tanstackQueryPlugin',
      options,
    },
  }
}

function createGeneratedPath(name: string) {
  mkdirSync(generatedRoot, { recursive: true })

  const dir = mkdtempSync(join(generatedRoot, `${name}-`))

  tempDirs.push(dir)

  return join(dir, 'api.generated.ts')
}

function createGeneratedDir(name: string) {
  mkdirSync(generatedRoot, { recursive: true })

  const dir = mkdtempSync(join(generatedRoot, `${name}-`))

  tempDirs.push(dir)

  return join(dir, 'client')
}

function formatDiagnostics(diagnostics: readonly ts.Diagnostic[]): string[] {
  return diagnostics.map((diagnostic) => {
    const message = ts.flattenDiagnosticMessageText(diagnostic.messageText, '\n')

    if (!diagnostic.file || diagnostic.start === undefined) {
      return message
    }

    const { line, character } = diagnostic.file.getLineAndCharacterOfPosition(diagnostic.start)

    return `${diagnostic.file.fileName}:${line + 1}:${character + 1} ${message}`
  })
}

function expectValidTypeScript(filePath: string) {
  const workspace = resolve(testDir, '../../..')
  const program = ts.createProgram({
    rootNames: [filePath],
    options: {
      allowImportingTsExtensions: true,
      baseUrl: workspace,
      module: ts.ModuleKind.ESNext,
      moduleDetection: ts.ModuleDetectionKind.Force,
      moduleResolution: ts.ModuleResolutionKind.Bundler,
      noEmit: true,
      noFallthroughCasesInSwitch: true,
      noPropertyAccessFromIndexSignature: true,
      noUnusedLocals: true,
      noUnusedParameters: true,
      paths: {
        '@hulla/api': ['packages/core/src/index.ts'],
        '@hulla/api/client': ['packages/core/src/client.ts'],
      },
      skipLibCheck: true,
      strict: true,
      target: ts.ScriptTarget.ESNext,
      verbatimModuleSyntax: true,
    },
  })

  expect(formatDiagnostics(ts.getPreEmitDiagnostics(program))).toStrictEqual([])
}

afterEach(() => {
  for (const dir of tempDirs.splice(0)) {
    rmSync(dir, { recursive: true, force: true })
  }
})

describe('OpenAPI generation', () => {
  test('uses operationId names by default and disambiguates duplicate names per router', () => {
    const code = generateCode(openAPIFixture)

    expect(code).toContain('usersFetch: clientProcedure(procedure')
    expect(code).toContain('usersFetch2: clientProcedure(procedure')
    expect(code).toContain('usersWrite: clientProcedure(procedure')
    expect(code).toContain('usersWrite2: clientProcedure(procedure')
    expect(code).toContain('deleteUser: clientProcedure(procedure')
    expect(code).toContain('getUsersIdAuditEvents: clientProcedure(procedure')
  })

  test('can ignore operationId names and derive names from method and path', () => {
    const code = generateCode(openAPIFixture, { operationNames: 'path' })

    expect(code).toContain('getUsers: clientProcedure(procedure')
    expect(code).toContain('postUsers: clientProcedure(procedure')
    expect(code).toContain('getUsersId: clientProcedure(procedure')
    expect(code).toContain('patchUsersId: clientProcedure(procedure')
    expect(code).toContain('deleteUsersId: clientProcedure(procedure')
    expect(code).toContain('getUsersIdAuditEvents: clientProcedure(procedure')
    expect(code).not.toContain('usersFetch: clientProcedure(procedure')
  })

  test('groups request input by params, query, headers, and body', () => {
    const code = generateCode(openAPIFixture, { operationNames: 'path' })

    expect(code).toContain('const GetUsersIdInputSchema = z.object({')
    expect(code).toContain('params: z.object({')
    expect(code).toContain('id: z.string().uuid(),')
    expect(code).toContain('query: z.object({')
    expect(code).toContain('includePosts: z.boolean().optional(),')
    expect(code).toContain('headers: z.object({')
    expect(code).toContain('"x-request-id": z.string().optional(),')
    expect(code).toContain('body: UpdateUserSchema,')
  })

  test('generates common Zod schema shapes', () => {
    const code = generateCode(openAPIFixture, { operationNames: 'path' })

    expect(code).toContain('export const UserStatusSchema = z.enum(["active", "disabled"])')
    expect(code).toContain('email: z.string().email().nullable().optional(),')
    expect(code).toContain('roles: z.array(z.string()),')
    expect(code).toContain('metadata: z.record(z.string(), z.string()).optional(),')
    expect(code).toContain('z.union([z.object({')
    expect(code).toContain('website: z.string().url(),')
    expect(code).toContain('type: z.literal("user.audit"),')
  })

  test('generates an awaited Hulla client factory', () => {
    const code = generateCode(openAPIFixture, { operationNames: 'path' })

    expect(code).toContain('import { createApi } from "@hulla/api"')
    expect(code).toContain('const api = createApi()')
    expect(code).toContain('system: api.router("system").define(({ procedure }) => ({')
    expect(code).toContain('getHealth: clientProcedure(procedure')
    expect(code).toContain('        .handler(() => client({ method: "GET", path: "/health" })),')
    expect(code).toContain('client<z.input<typeof GetUsersIdOutputSchema>>')
  })

  test('can generate Hulla clients with plugins', () => {
    const code = generateCode(openAPIFixture, {
      operationNames: 'path',
      plugins: [queryPlugin()],
    })

    expect(code).toContain('import { tanstackQueryPlugin as hullaPlugin1 } from "@hulla/api-tanstack-query"')
    expect(code).toContain('const api = createApi({ plugins: [hullaPlugin1()] })')
  })

  test('reconstructs direct plugin instances from generation metadata', () => {
    const code = generateCode(openAPIFixture, {
      operationNames: 'path',
      plugins: [queryPlugin({ namespace: 'tanstack' })],
    })

    expect(code).toContain('import { tanstackQueryPlugin as hullaPlugin1 } from "@hulla/api-tanstack-query"')
    expect(code).toContain('const api = createApi({ plugins: [hullaPlugin1({"namespace":"tanstack"})] })')
  })

  test('writes generated files and emits valid TypeScript for operationId names', async () => {
    const output = createGeneratedPath('operation-id')
    const result = await generate({
      input: openAPIFixture,
      output,
    })

    expect(result.operations).toStrictEqual([
      { method: 'get', path: '/health', routerName: 'system', procedureName: 'getHealth' },
      { method: 'get', path: '/users', routerName: 'users', procedureName: 'usersFetch' },
      { method: 'post', path: '/users', routerName: 'users', procedureName: 'usersWrite' },
      { method: 'get', path: '/users/{id}', routerName: 'users', procedureName: 'usersFetch2' },
      { method: 'patch', path: '/users/{id}', routerName: 'users', procedureName: 'usersWrite2' },
      { method: 'delete', path: '/users/{id}', routerName: 'users', procedureName: 'deleteUser' },
      {
        method: 'get',
        path: '/users/{id}/audit-events',
        routerName: 'users',
        procedureName: 'getUsersIdAuditEvents',
      },
    ])
    expectValidTypeScript(output)
  })

  test('writes generated files and emits valid TypeScript for path-derived names', async () => {
    const output = createGeneratedPath('path')

    await generate({
      input: openAPIFixture,
      output,
      operationNames: 'path',
    })

    expectValidTypeScript(output)
  })

  test('writes directory output split by shallow URL path groups', async () => {
    const output = createGeneratedDir('directory')

    await generate({
      input: openAPIFixture,
      output,
      operationNames: 'path',
    })

    const indexPath = join(output, 'index.ts')
    const usersPath = join(output, 'routes', 'users.ts')
    const healthPath = join(output, 'routes', 'health.ts')

    expect(existsSync(indexPath)).toBe(true)
    expect(existsSync(join(output, 'types.ts'))).toBe(true)
    expect(existsSync(join(output, 'schemas.ts'))).toBe(true)
    expect(existsSync(usersPath)).toBe(true)
    expect(existsSync(healthPath)).toBe(true)
    expect(readFileSync(indexPath, 'utf8')).toContain("from './routes/users'")
    expect(readFileSync(indexPath, 'utf8')).toContain('export function createOpenAPIClient')
    expect(readFileSync(usersPath, 'utf8')).toContain('export function usersGetUsersHandler')
    expect(readFileSync(healthPath, 'utf8')).toContain('path: "/health"')
    expectValidTypeScript(indexPath)
  })

  test('removes only obsolete files owned by the directory manifest', async () => {
    const output = createGeneratedDir('manifest-cleanup')
    await generate({ input: openAPIFixture, output })
    const unrelated = join(output, 'notes.txt')
    writeFileSync(unrelated, 'keep me')

    const reduced = structuredClone(openAPIFixture) as OpenAPIDocument
    reduced.paths = { '/users': reduced.paths['/users']! }
    await generate({ input: reduced, output })

    expect(existsSync(join(output, 'routes', 'health.ts'))).toBe(false)
    expect(existsSync(join(output, 'routes', 'users.ts'))).toBe(true)
    expect(readFileSync(unrelated, 'utf8')).toBe('keep me')
    expect(JSON.parse(readFileSync(join(output, '.hulla-api-openapi-manifest.json'), 'utf8'))).toMatchObject({
      version: 1,
      files: expect.arrayContaining(['index.ts', 'routes/users.ts', 'types.ts']),
    })

    writeFileSync(
      join(output, '.hulla-api-openapi-manifest.json'),
      JSON.stringify({ version: 1, files: ['../outside.ts'] })
    )
    await expect(generate({ input: reduced, output })).rejects.toThrow('Unsafe OpenAPI output path')
  })

  test('writes directory output with plugin imports', async () => {
    const output = createGeneratedDir('directory-plugins')

    await generate({
      input: openAPIFixture,
      output,
      plugins: [queryPlugin()],
    })

    const index = readFileSync(join(output, 'index.ts'), 'utf8')

    expect(index).toContain('import { tanstackQueryPlugin as hullaPlugin1 } from "@hulla/api-tanstack-query"')
    expect(index).toContain('const api = createApi({ plugins: [hullaPlugin1()] })')
  })

  test('can consume an OpenAPI document from a previous source output', async () => {
    const output = createGeneratedDir('source-output')
    const openapiPath = join(output, 'backend.openapi.json')

    mkdirSync(output, { recursive: true })
    writeFileSync(openapiPath, JSON.stringify(openAPIFixture))

    const source = openapi({
      name: 'backend',
      input: 'api.openapi',
    })

    await source.generate({
      cwd: testDir,
      configPath: join(testDir, 'api.config.ts'),
      outDir: output,
      sourceDir: join(output, 'sources', 'backend'),
      sources: [
        {
          name: 'api',
          outputs: {
            openapi: openapiPath,
          },
        },
      ],
    })

    expect(existsSync(join(output, 'sources', 'backend', 'index.ts'))).toBe(true)
  })

  test('can be used as a @hulla/api source adapter', async () => {
    const output = createGeneratedDir('adapter')
    const source = openapi({
      name: 'app',
      input: openAPIFixture,
      baseUrl: '/api',
    })

    const result = await source.generate({
      cwd: testDir,
      configPath: join(testDir, 'api.config.ts'),
      outDir: output,
      sourceDir: join(output, 'sources', 'app'),
      sources: [],
    })

    expect(result).toStrictEqual({
      name: 'app',
      baseUrl: '/api',
      importPath: './sources/app',
      factoryName: 'createOpenAPIClient',
    })
    expect(existsSync(join(output, 'sources', 'app', 'index.ts'))).toBe(true)
  })

  test('resolves reusable operation components and safely emits recursive schemas', async () => {
    const document = {
      openapi: '3.1.0',
      components: {
        schemas: {
          Parent: {
            type: 'object',
            required: ['child'],
            properties: {
              child: { $ref: '#/components/schemas/Child' },
            },
          },
          Child: {
            type: 'object',
            required: ['name'],
            properties: {
              name: { type: 'string' },
            },
          },
          Node: {
            type: 'object',
            required: ['value'],
            properties: {
              value: { type: 'string' },
              next: { $ref: '#/components/schemas/Node' },
            },
          },
        },
        parameters: {
          Id: {
            name: 'id',
            in: 'path',
            required: true,
            schema: { type: 'integer' },
          },
        },
        requestBodies: {
          ParentBody: {
            required: true,
            content: {
              'application/json': {
                schema: { $ref: '#/components/schemas/Parent' },
              },
            },
          },
        },
        responses: {
          NodeResponse: {
            content: {
              'application/json': {
                schema: { $ref: '#/components/schemas/Node' },
              },
            },
          },
        },
      },
      paths: {
        '/nodes/{id}': {
          post: {
            parameters: [{ $ref: '#/components/parameters/Id' }],
            requestBody: { $ref: '#/components/requestBodies/ParentBody' },
            responses: {
              '200': { $ref: '#/components/responses/NodeResponse' },
            },
          },
        },
      },
    } as const
    const code = generateCode(document)
    const childIndex = code.indexOf('export const ChildSchema')
    const parentIndex = code.indexOf('export const ParentSchema')

    expect(childIndex).toBeGreaterThan(-1)
    expect(parentIndex).toBeGreaterThan(childIndex)
    expect(code).toContain('export const NodeSchema: z.ZodType<unknown> = z.lazy(() =>')
    expect(code).toContain('id: z.number().int(),')
    expect(code).toContain('body: ParentSchema,')
    expect(code).toContain('const PostNodesIdOutputSchema = NodeSchema')
    expect(code).toContain('.output(PostNodesIdOutputSchema)')

    const output = createGeneratedPath('references')
    await generate({ input: document, output })
    expectValidTypeScript(output)
  })

  test('fails clearly for unresolved and external references', () => {
    expect(() =>
      generateCode({
        paths: {
          '/broken': {
            get: {
              responses: {
                '200': { $ref: '#/components/responses/Missing' },
              },
            },
          },
        },
      })
    ).toThrow('could not be resolved')

    expect(() =>
      generateCode({
        paths: {
          '/external': {
            get: {
              responses: {
                '200': { $ref: 'responses.json#/Success' },
              },
            },
          },
        },
      })
    ).toThrow('Bundle the document before generation')
  })

  test('supports repeated scalar query arrays and string text responses', () => {
    const code = generateCode({
      paths: {
        '/search': {
          get: {
            parameters: [
              {
                name: 'tag',
                in: 'query',
                schema: { type: 'array', items: { type: 'string' } },
              },
            ],
            responses: {
              '200': {
                content: {
                  'text/plain': { schema: { type: 'string' } },
                },
              },
            },
          },
        },
      },
    })

    expect(code).toContain('tag: z.array(z.string()).optional(),')
    expect(code).toContain('const GetSearchOutputSchema = z.string()')
  })

  test('rejects OpenAPI transports the generated client cannot represent honestly', () => {
    const operation = (overrides: Record<string, unknown>): OpenAPIDocument => ({
      paths: {
        '/unsupported': {
          post: {
            responses: { '204': {} },
            ...overrides,
          },
        },
      },
    })

    expect(() =>
      generateCode(operation({ parameters: [{ name: 'session', in: 'cookie', schema: { type: 'string' } }] }))
    ).toThrow('unsupported cookie transport')
    expect(() =>
      generateCode(
        operation({
          parameters: [
            { name: 'filter', in: 'query', style: 'deepObject', schema: { type: 'object', properties: {} } },
          ],
        })
      )
    ).toThrow('supported scalar or repeated scalar array')
    expect(() =>
      generateCode(
        operation({
          parameters: [
            { name: 'tag', in: 'query', explode: false, schema: { type: 'array', items: { type: 'string' } } },
          ],
        })
      )
    ).toThrow('explode: false')
    expect(() =>
      generateCode(
        operation({ parameters: [{ name: 'query', in: 'query', allowReserved: true, schema: { type: 'string' } }] })
      )
    ).toThrow('allowReserved')
    expect(() =>
      generateCode(
        operation({
          requestBody: {
            content: { 'multipart/form-data': { schema: { type: 'object', properties: {} } } },
          },
        })
      )
    ).toThrow('support JSON request bodies only')
    expect(() =>
      generateCode(
        operation({
          responses: {
            '200': { content: { 'application/octet-stream': { schema: { type: 'string', format: 'binary' } } } },
          },
        })
      )
    ).toThrow('unsupported response media type')
    expect(() =>
      generateCode(
        operation({
          responses: {
            '200': { content: { 'text/plain': { schema: { type: 'object', properties: {} } } } },
          },
        })
      )
    ).toThrow('text responses with a string schema')
  })
})
