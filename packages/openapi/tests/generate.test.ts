import { existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync } from 'node:fs'
import { dirname, join, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'
import ts from 'typescript'
import { afterEach, describe, expect, test } from 'vitest'
import { generate, generateCode } from '../src'
import { openAPIFixture } from './fixtures/openapi.fixture'

const testDir = dirname(fileURLToPath(import.meta.url))
const generatedRoot = resolve(testDir, '.generated')
const tempDirs: string[] = []

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
  const program = ts.createProgram({
    rootNames: [filePath],
    options: {
      allowImportingTsExtensions: true,
      module: ts.ModuleKind.ESNext,
      moduleDetection: ts.ModuleDetectionKind.Force,
      moduleResolution: ts.ModuleResolutionKind.Bundler,
      noEmit: true,
      noFallthroughCasesInSwitch: true,
      noPropertyAccessFromIndexSignature: true,
      noUnusedLocals: true,
      noUnusedParameters: true,
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

    expect(code).toContain('usersFetch: procedure')
    expect(code).toContain('usersFetch2: procedure')
    expect(code).toContain('usersWrite: procedure')
    expect(code).toContain('usersWrite2: procedure')
    expect(code).toContain('deleteUser: procedure')
    expect(code).toContain('getUsersIdAuditEvents: procedure')
  })

  test('can ignore operationId names and derive names from method and path', () => {
    const code = generateCode(openAPIFixture, { operationNames: 'path' })

    expect(code).toContain('getUsers: procedure')
    expect(code).toContain('postUsers: procedure')
    expect(code).toContain('getUsersId: procedure')
    expect(code).toContain('patchUsersId: procedure')
    expect(code).toContain('deleteUsersId: procedure')
    expect(code).toContain('getUsersIdAuditEvents: procedure')
    expect(code).not.toContain('usersFetch: procedure')
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
    expect(code).toContain('metadata: z.record(z.string()).optional(),')
    expect(code).toContain('z.union([z.object({')
    expect(code).toContain('website: z.string().url(),')
    expect(code).toContain('type: z.literal("user.audit"),')
  })

  test('generates an awaited Hulla client factory', () => {
    const code = generateCode(openAPIFixture, { operationNames: 'path' })

    expect(code).toContain("const h = api({ settings: { output: 'awaited' as const } })")
    expect(code).toContain('system: h.router("system").define(({ procedure }) => ({')
    expect(code).toContain('getHealth: procedure')
    expect(code).toContain('        .handler(() => client({ method: "GET", path: "/health" })),')
    expect(code).toContain('client<z.input<typeof GetUsersIdOutputSchema>>')
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
})
