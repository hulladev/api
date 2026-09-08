import { mkdtemp, rm, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'
import { codec, defineContract, defineErrors, response, route, router } from '@hulla/api'
import ts from 'typescript'
import { describe, expect, test } from 'vitest'
import { z } from 'zod'
import {
  createOpenAPIDocument,
  defineOpenAPI,
  generateContractFromOpenAPI,
  readOpenAPIDocument,
  writeOpenAPIDocument,
  type OpenAPIDocument,
} from '../src'

const userSchema = z.object({ id: z.string().uuid(), name: z.string() })
const errors = defineErrors({ USER_NOT_FOUND: { message: 'User not found' } })

export const documentedContract = defineContract({
  basePath: '/api',
  errors: { 404: errors.USER_NOT_FOUND },
  routes: {
    /**
     * Returns one user from the account directory.
     *
     * @summary Get a user
     * @tag Users
     */
    getUser: route.get('/users/:id', {
      params: z.object({ id: z.string().uuid() }),
      query: z.object({ expand: z.enum(['profile', 'teams']).optional() }),
      responses: { 200: response.json(userSchema) },
    }),
  },
})

const documentation = defineOpenAPI(documentedContract, {
  info: { title: 'Users API', version: '1.0.0' },
  docstrings: { source: fileURLToPath(import.meta.url), contract: 'documentedContract' },
  routes: {
    getUser: {
      description: 'An explicit description wins over JSDoc.',
      request: {
        path: { id: { description: 'User identifier' } },
        query: { expand: { description: 'Related resources to include' } },
      },
      responses: {
        200: {
          description: 'The requested user',
          examples: { ada: { value: { id: '4f14c4f7-17b7-49e5-a7b6-11e3b4ea9472', name: 'Ada' } } },
        },
        404: { description: 'No user has that identifier' },
      },
    },
  },
})

function diagnosticsFor(files: readonly string[]): string[] {
  const workspace = resolve(fileURLToPath(new URL('../../..', import.meta.url)))
  const program = ts.createProgram({
    rootNames: [...files],
    options: {
      module: ts.ModuleKind.ESNext,
      moduleResolution: ts.ModuleResolutionKind.Bundler,
      noEmit: true,
      noUnusedLocals: true,
      noUnusedParameters: true,
      paths: {
        '@hulla/api': [`${workspace}/packages/core/src/index.ts`],
        '@hulla/api-openapi': [`${workspace}/packages/openapi/src/index.ts`],
        zod: [`${workspace}/packages/openapi/node_modules/zod/index.d.ts`],
      },
      skipLibCheck: true,
      strict: true,
      target: ts.ScriptTarget.ESNext,
      types: ['node'],
      verbatimModuleSyntax: true,
    },
  })
  return ts
    .getPreEmitDiagnostics(program)
    .map((diagnostic) => ts.flattenDiagnosticMessageText(diagnostic.messageText, '\n'))
}

describe('contract to OpenAPI', () => {
  test('exports wire schemas, exhaustive responses, and build-time docstrings', async () => {
    const document = await createOpenAPIDocument(documentation)
    const operation = document.paths['/api/users/{id}']?.get

    expect(document).toMatchObject({ openapi: '3.1.2', info: { title: 'Users API', version: '1.0.0' } })
    expect(operation).toMatchObject({
      operationId: 'getUser',
      summary: 'Get a user',
      description: 'An explicit description wins over JSDoc.',
      tags: ['Users'],
      parameters: [
        { name: 'id', in: 'path', required: true, description: 'User identifier' },
        { name: 'expand', in: 'query', required: false, description: 'Related resources to include' },
      ],
      responses: {
        200: { description: 'The requested user' },
        404: { description: 'No user has that identifier' },
      },
    })
    expect(operation?.responses['200']).toHaveProperty('content.application/json.schema.type', 'object')
    expect(operation?.responses['404']).toMatchObject({
      content: {
        'application/json': {
          schema: {
            type: 'object',
            properties: { code: { const: 'USER_NOT_FOUND' }, message: { type: 'string' } },
            required: ['code', 'message'],
            additionalProperties: false,
          },
        },
      },
    })
  })

  test('preserves Standard JSON Schema conversion through @hulla/api codecs', async () => {
    const date = codec(z.string().datetime(), z.date(), {
      decode: (value) => new Date(value),
      encode: (value) => value.toISOString(),
    })
    const contract = defineContract({
      routes: { now: route.get('/now', { responses: { 200: response.json(date) } }) },
    })
    const definition = defineOpenAPI(contract, {
      info: { title: 'Clock', version: '1' },
      routes: { now: { responses: { 200: { description: 'Current time' } } } },
    })

    const document = await createOpenAPIDocument(definition)
    expect(document.paths['/now']?.get?.responses['200']).toHaveProperty(
      'content.application/json.schema.format',
      'date-time'
    )
  })

  test('emits one error variant per code when a status is shared', async () => {
    const failures = defineErrors({
      USER_NOT_FOUND: { message: 'User not found', data: z.object({ id: z.string() }) },
      TEAM_NOT_FOUND: { message: 'Team not found' },
    })
    const contract = defineContract({
      errors: { 404: [failures.USER_NOT_FOUND, failures.TEAM_NOT_FOUND] },
      routes: {
        lookup: route.get('/lookup', { responses: { 200: response.json(z.object({ ok: z.literal(true) })) } }),
      },
    })
    const definition = defineOpenAPI(contract, {
      info: { title: 'Lookup', version: '1' },
      routes: {
        lookup: {
          responses: { 200: { description: 'Found' }, 404: { description: 'Not found' } },
        },
      },
    })

    const document = await createOpenAPIDocument(definition)
    const schema = document.paths['/lookup']?.get?.responses['404']
    expect(schema).toHaveProperty('content.application/json.schema.oneOf.length', 2)
    expect(schema).toHaveProperty('content.application/json.schema.oneOf.0.properties.data.type', 'object')
  })

  test('rejects sidecars that drift through an intermediate untyped value', async () => {
    const invalid = defineOpenAPI(documentedContract, {
      info: { title: 'Invalid', version: '1' },
      routes: {} as never,
    })
    await expect(createOpenAPIDocument(invalid)).rejects.toThrow('missing "getUser"')
  })

  test('mirrors router structure and accumulated path parameter documentation', async () => {
    const contract = defineContract({
      routes: {
        organizations: router('/organizations/:organizationId', {
          params: z.object({ organizationId: z.string() }),
          routes: {
            getUser: route.get('/users/:userId', {
              params: z.object({ userId: z.string() }),
              responses: { 200: response.json(userSchema) },
            }),
          },
        }),
      },
    })
    const definition = defineOpenAPI(contract, {
      info: { title: 'Organizations', version: '1' },
      routes: {
        organizations: {
          getUser: {
            request: {
              path: {
                organizationId: { description: 'Organization ID' },
                userId: { description: 'User ID' },
              },
            },
            responses: { 200: { description: 'The user' } },
          },
        },
      },
    })

    const document = await createOpenAPIDocument(definition)
    expect(document.paths['/organizations/{organizationId}/users/{userId}']?.get?.parameters).toMatchObject([
      { name: 'organizationId', description: 'Organization ID' },
      { name: 'userId', description: 'User ID' },
    ])
  })
})

describe('OpenAPI to contract', () => {
  test('generates a runtime contract and separate typed sidecar', async () => {
    const source: OpenAPIDocument = {
      openapi: '3.1.2',
      info: { title: 'Pets', version: '1.0.0' },
      paths: {
        '/pets/{id}': {
          get: {
            operationId: 'getPet',
            summary: 'Get a pet',
            parameters: [
              { name: 'id', in: 'path', required: true, description: 'Pet ID', schema: { type: 'integer' } },
            ],
            responses: {
              200: {
                description: 'The pet',
                content: {
                  'application/json': {
                    schema: {
                      type: 'object',
                      properties: { id: { type: 'integer' }, name: { type: 'string' } },
                      required: ['id', 'name'],
                    },
                  },
                },
              },
              404: { description: 'Missing' },
            },
          },
        },
      },
    }

    const generated = generateContractFromOpenAPI(source)
    expect(generated.contractCode).toContain("getPet: route.get('/pets/:id'".replaceAll("'", '"'))
    expect(generated.contractCode).toContain('id: z.coerce.number<string>().int()')
    expect(generated.contractCode).toContain('200: response.json(z.object({')
    expect(generated.contractCode).toContain('404: response.empty()')
    expect(generated.openapiCode).toContain('export default defineOpenAPI(contract, {')
    expect(generated.openapiCode).toContain('"summary": "Get a pet"')

    const directory = await mkdtemp(join(tmpdir(), 'hulla-openapi-'))
    const contractPath = join(directory, 'api.generated.ts')
    const openapiPath = join(directory, 'api.generated.openapi.ts')
    try {
      await Promise.all([
        writeFile(contractPath, generated.contractCode),
        writeFile(openapiPath, generated.openapiCode),
      ])
      expect(diagnosticsFor([contractPath, openapiPath])).toEqual([])
    } finally {
      await rm(directory, { recursive: true, force: true })
    }
  })

  test('reads and writes YAML documents', async () => {
    const directory = await mkdtemp(join(tmpdir(), 'hulla-openapi-yaml-'))
    const path = join(directory, 'openapi.yaml')
    const document: OpenAPIDocument = {
      openapi: '3.1.2',
      info: { title: 'YAML', version: '1' },
      paths: {},
    }
    try {
      await writeOpenAPIDocument(path, document)
      await expect(readOpenAPIDocument(path)).resolves.toEqual(document)
    } finally {
      await rm(directory, { recursive: true, force: true })
    }
  })

  test('reports unsupported transport semantics instead of emitting placeholders', () => {
    const document: OpenAPIDocument = {
      openapi: '3.1.2',
      info: { title: 'Unsupported', version: '1' },
      paths: {
        '/sessions': {
          get: {
            parameters: [{ name: 'session', in: 'cookie', schema: { type: 'string' } }],
            responses: { 200: { description: 'OK' } },
          },
        },
      },
    }

    expect(() => generateContractFromOpenAPI(document)).toThrowError(
      expect.objectContaining({
        diagnostics: expect.arrayContaining([
          expect.objectContaining({
            severity: 'error',
            message: 'cookie parameters are not supported by @hulla/api routes',
          }),
        ]),
      })
    )
  })
})

test('generated null-only and nullable-union schemas reject other JSON values', async () => {
  const { zodSchemaCodeGenerator } = await import('../src/import')
  const generator = zodSchemaCodeGenerator()
  const compile = (schema: Parameters<typeof generator.schema>[0]) => {
    const code = generator.schema(schema, { location: 'test', transport: 'json' })
    return new Function('z', `return ${code}`)(z) as z.ZodType
  }
  for (const schema of [{ type: 'null' }, { type: ['null'] }] as const) {
    const validator = compile(schema)
    expect(validator.safeParse(null).success).toBe(true)
    for (const value of ['text', 1, false, {}, []]) expect(validator.safeParse(value).success).toBe(false)
  }
  const nullable = compile({ anyOf: [{ type: 'string' }, { type: 'null' }] })
  expect(nullable.safeParse(null).success).toBe(true)
  expect(nullable.safeParse('text').success).toBe(true)
  expect(nullable.safeParse({ unexpected: true }).success).toBe(false)
  expect(compile({}).safeParse({ arbitrary: true }).success).toBe(true)
})

test.each([false, true])('generated text parameters decode across HTTP with references=%s', async (references) => {
  const { defineServer } = await import('@hulla/api/server')
  const { fetchAdapter } = await import('@hulla/api/fetch')
  const number = { type: 'integer', minimum: 1 } as const
  const boolean = { type: 'boolean' } as const
  const components = { Count: number, Enabled: boolean }
  const select = (name: keyof typeof components) =>
    references ? { $ref: `#/components/schemas/${name}` } : components[name]
  const generated = generateContractFromOpenAPI({
    openapi: '3.1.2',
    info: { title: 'parameters', version: '1' },
    components: { schemas: components },
    paths: {
      '/items/{id}': {
        get: {
          operationId: 'items',
          parameters: [
            { name: 'id', in: 'path', required: true, schema: select('Count') },
            {
              name: 'limit',
              in: 'query',
              required: true,
              schema: { anyOf: [select('Count'), { type: 'string', enum: ['all'] }] },
            },
            { name: 'x-enabled', in: 'header', required: true, schema: select('Enabled') },
          ],
          responses: { 200: { description: 'ok', content: { 'application/json': { schema: { type: 'object' } } } } },
        },
      },
    },
  })
  const code = ts
    .transpileModule(generated.contractCode, {
      compilerOptions: { module: ts.ModuleKind.ESNext, target: ts.ScriptTarget.ESNext },
    })
    .outputText.replace(/^import .*$/gm, '')
    .replace('export const contract', 'const contract')
  const handler = new Function(
    'z',
    'defineContract',
    'response',
    'route',
    'defineServer',
    'fetchAdapter',
    `${code};
    return fetchAdapter().mount(defineServer(contract).implement({
      items: ({ params, query, headers }) => ({ status: 200, body: { params, query, headers } })
    }));
  `
  )(z, defineContract, response, route, defineServer, fetchAdapter) as (request: Request) => Promise<Response>
  const result = await handler(new Request('http://local/items/2?limit=3', { headers: { 'x-enabled': 'true' } }))
  expect(result.status).toBe(200)
  expect(await result.json()).toEqual({ params: { id: 2 }, query: { limit: 3 }, headers: { 'x-enabled': true } })
  expect(
    (await handler(new Request('http://local/items/0?limit=3', { headers: { 'x-enabled': 'true' } }))).status
  ).toBe(400)
})

test('generated object schemas preserve allowed additional JSON fields', async () => {
  const { zodSchemaCodeGenerator } = await import('../src/import')
  const generator = zodSchemaCodeGenerator()
  const compile = (schema: Parameters<typeof generator.schema>[0]) =>
    new Function('z', `return ${generator.schema(schema, { location: 'test', transport: 'json' })}`)(z) as z.ZodType
  for (const additionalProperties of [undefined, true, {}]) {
    for (const properties of [undefined, { known: { type: 'string' } }]) {
      const validator = compile({
        type: 'object',
        ...(properties === undefined ? {} : { properties }),
        additionalProperties,
      })
      const input = { known: 'value', extra: { nested: [1, null, true] } }
      expect(validator.parse(input)).toEqual(input)
    }
  }
  expect(compile({ type: 'object', additionalProperties: false }).safeParse({ extra: true }).success).toBe(false)
  const numeric = compile({
    type: 'object',
    properties: { known: { type: 'string' } },
    additionalProperties: { type: 'number' },
  })
  expect(numeric.parse({ known: 'value', extra: 3 })).toEqual({ known: 'value', extra: 3 })
  expect(numeric.safeParse({ known: 'value', extra: 'invalid' }).success).toBe(false)
})

test.each([
  { names: ['User-ID', 'User_ID'], message: 'conflicts with component' },
  { names: ['123'], message: 'not a valid identifier' },
])('reports unusable generated component names: $names', ({ names, message }) => {
  expect(() =>
    generateContractFromOpenAPI({
      openapi: '3.1.2',
      info: { title: 'Names', version: '1' },
      components: { schemas: Object.fromEntries(names.map((name) => [name, { type: 'string' }])) },
      paths: {
        '/item': {
          get: {
            responses: {
              200: {
                description: 'ok',
                content: { 'application/json': { schema: { $ref: `#/components/schemas/${names[0]}` } } },
              },
            },
          },
        },
      },
    })
  ).toThrowError(
    expect.objectContaining({
      diagnostics: expect.arrayContaining([
        expect.objectContaining({
          severity: 'error',
          location: `components.schemas.${names.at(-1)}`,
          message: expect.stringContaining(message),
        }),
      ]),
    })
  )
})

test('custom schema generators retain their imports and produce compilable contracts', async () => {
  const generated = generateContractFromOpenAPI(
    {
      openapi: '3.1.2',
      info: { title: 'Custom', version: '1' },
      paths: {
        '/item': {
          get: {
            responses: { 200: { description: 'ok', content: { 'application/json': { schema: { type: 'string' } } } } },
          },
        },
      },
    },
    {
      schemaGenerator: {
        imports: ['import { z as v } from "zod"'],
        componentName: (name) => `${name}Schema`,
        componentDeclaration: (name) => `const ${name}Schema = v.string()`,
        schema: () => 'v.string()',
        object: () => 'v.object({})',
      },
    }
  )
  expect(generated.contractCode).toContain('import { z as v } from "zod"')
  const directory = await mkdtemp(join(tmpdir(), 'hulla-openapi-custom-'))
  const path = join(directory, 'api.generated.ts')
  try {
    await writeFile(path, generated.contractCode)
    expect(diagnosticsFor([path])).toEqual([])
  } finally {
    await rm(directory, { recursive: true, force: true })
  }
})
