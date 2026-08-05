import { readFile } from 'node:fs/promises'
import { join } from 'node:path'
import { relativeImport, type APIPlugin, type APISource, type APISourceGenerateResult } from '@hulla/api'
import { writeOpenAPIOutput } from './output'
import { createApiExpression, pluginImportLines } from './plugins'

export type OperationNameMode = 'operationId' | 'path'

export type GenerateOpenAPIConfig = {
  input: string | OpenAPIDocument
  output?: string
  operationNames?: OperationNameMode
  apiImport?: string
  zodImport?: string
  plugins?: readonly APIPlugin[]
}

export type OpenAPISourceConfig = Omit<GenerateOpenAPIConfig, 'output'> & {
  name?: string
  baseUrl?: string
}

export type GenerateOpenAPIResult = {
  code: string
  operations: GeneratedOperation[]
}

export type GeneratedOperation = {
  method: HTTPMethod
  path: string
  routerName: string
  procedureName: string
}

export type OpenAPIDocument = {
  openapi?: string
  swagger?: string
  components?: {
    schemas?: Record<string, JSONSchema>
    parameters?: Record<string, ParameterObject | ReferenceObject>
    requestBodies?: Record<string, RequestBody | ReferenceObject>
    responses?: Record<string, ResponseObject | ReferenceObject>
  }
  paths: Record<string, PathItem | undefined>
}

type HTTPMethod = 'get' | 'put' | 'post' | 'delete' | 'options' | 'head' | 'patch' | 'trace'

type PathItem = Partial<Record<HTTPMethod, Operation>> & {
  parameters?: readonly Parameter[]
}

type Operation = {
  operationId?: string
  tags?: readonly string[]
  parameters?: readonly Parameter[]
  requestBody?: RequestBody | ReferenceObject
  responses?: Record<string, ResponseObject | ReferenceObject | undefined>
}

type Parameter = ReferenceObject | ParameterObject

type ParameterObject = {
  name: string
  in: 'query' | 'header' | 'path' | 'cookie'
  required?: boolean
  style?: string
  explode?: boolean
  allowReserved?: boolean
  schema?: JSONSchema | ReferenceObject
  content?: Record<string, MediaType | undefined>
}

type RequestBody = {
  required?: boolean
  content?: Record<string, MediaType | undefined>
}

type ResponseObject = {
  content?: Record<string, MediaType | undefined>
}

type MediaType = {
  schema?: JSONSchema | ReferenceObject
}

type ReferenceObject = {
  $ref: string
}

type JSONSchema = {
  $ref?: string
  type?: string | string[]
  format?: string
  enum?: readonly unknown[]
  const?: unknown
  nullable?: boolean
  properties?: Record<string, JSONSchema | ReferenceObject | undefined>
  required?: readonly string[]
  items?: JSONSchema | ReferenceObject
  additionalProperties?: boolean | JSONSchema | ReferenceObject
  oneOf?: readonly (JSONSchema | ReferenceObject)[]
  anyOf?: readonly (JSONSchema | ReferenceObject)[]
  allOf?: readonly (JSONSchema | ReferenceObject)[]
}

type OperationInputPart = {
  key: 'params' | 'query' | 'headers' | 'body'
  schema: string
  required: boolean
}

type OperationModel = GeneratedOperation & {
  inputSchema?: string
  outputSchema?: string
  outputType?: string
}

type OutputFile = {
  path: string
  code: string
}

type ComponentSchema = {
  name: string
  schema: JSONSchema
  recursive: boolean
}

const httpMethods = ['get', 'post', 'put', 'patch', 'delete', 'options', 'head', 'trace'] as const

export function openapi(config: OpenAPISourceConfig): APISource {
  return {
    name: config.name,
    inputs: typeof config.input === 'string' && !isSourceOutputReference(config.input) ? [config.input] : [],
    async generate(context) {
      await generate({
        ...config,
        input: resolveOpenAPIInput(config.input, context.sources),
        output: context.sourceDir,
      })

      return {
        name: config.name ?? 'openapi',
        baseUrl: config.baseUrl,
        importPath: relativeImport(context.outDir, join(context.sourceDir, 'index')),
        factoryName: 'createOpenAPIClient',
      }
    },
  }
}

function resolveOpenAPIInput(input: string | OpenAPIDocument, sources: readonly APISourceGenerateResult[]) {
  if (typeof input !== 'string') {
    return input
  }

  const reference = parseSourceOutputReference(input)

  if (reference === undefined) {
    return input
  }

  const source = sources.find((candidate) => candidate.name === reference.sourceName)
  const output = source?.outputs?.[reference.outputName]

  if (output === undefined) {
    throw new Error(`OpenAPI source input "${input}" could not be resolved from previous source outputs.`)
  }

  return output
}

function isSourceOutputReference(input: string): boolean {
  return parseSourceOutputReference(input) !== undefined
}

function parseSourceOutputReference(input: string): { sourceName: string; outputName: string } | undefined {
  if (input.includes('/') || input.includes('\\')) {
    return undefined
  }

  const [sourceName, outputName, ...rest] = input.split('.')

  if (sourceName === undefined || outputName !== 'openapi' || rest.length > 0) {
    return undefined
  }

  return { sourceName, outputName }
}

export async function generate(config: GenerateOpenAPIConfig): Promise<GenerateOpenAPIResult> {
  const document = typeof config.input === 'string' ? await readDocument(config.input) : config.input
  const code = generateCode(document, config)

  if (config.output !== undefined) {
    await writeOpenAPIOutput(config.output, code, generateOutputFiles(document, config))
  }

  return {
    code,
    operations: collectOperations(document, config).map(({ method, path, routerName, procedureName }) => ({
      method,
      path,
      routerName,
      procedureName,
    })),
  }
}

export function generateCode(document: OpenAPIDocument, config: Omit<GenerateOpenAPIConfig, 'input' | 'output'> = {}) {
  validateLocalReferences(document)
  const apiImport = config.apiImport ?? '@hulla/api'
  const zodImport = config.zodImport ?? 'zod'
  const componentSchemas = orderComponentSchemas(document.components?.schemas ?? {})
  const operations = collectOperations(document, config)
  const lines: string[] = [
    `import { createApi } from ${quote(apiImport)}`,
    "import { clientProcedure } from '@hulla/api/client'",
    "import type { ClientRequestOptions } from '@hulla/api/client'",
    ...pluginImportLines(config.plugins),
    `import { z } from ${quote(zodImport)}`,
    '',
    'export type OpenAPIRequest = {',
    '  method: string',
    '  path: string',
    '  params?: unknown',
    '  query?: unknown',
    '  headers?: unknown',
    '  body?: unknown',
    '}',
    '',
    'export type OpenAPIClient = <T>(request: OpenAPIRequest, options?: ClientRequestOptions) => T | Promise<T>',
    '',
  ]

  for (const component of componentSchemas) {
    lines.push(componentSchemaDeclaration(component), '')
  }

  const operationSchemas = operations.flatMap((operation) => {
    const schemas: string[] = []

    if (operation.inputSchema !== undefined) {
      schemas.push(`const ${operationConstName(operation, 'Input')} = ${operation.inputSchema}`)
    }

    if (operation.outputSchema !== undefined) {
      schemas.push(`const ${operationConstName(operation, 'Output')} = ${operation.outputSchema}`)
    }

    return schemas
  })

  if (operationSchemas.length > 0) {
    lines.push(...operationSchemas, '')
  }

  lines.push('export function createOpenAPIClient(client: OpenAPIClient) {')
  lines.push(`  const api = ${createApiExpression(config.plugins)}`)
  lines.push('')
  lines.push('  return {')

  for (const router of groupByRouter(operations)) {
    lines.push(`    ${propertyKey(router.name)}: api.router(${quote(router.name)}).define(({ procedure }) => ({`)

    for (const operation of router.operations) {
      lines.push(`      ${propertyKey(operation.procedureName)}: clientProcedure(procedure`)

      if (operation.inputSchema !== undefined) {
        lines.push(`        .input(${operationConstName(operation, 'Input')})`)
      }

      if (operation.outputSchema !== undefined) {
        lines.push(`        .output(${operationConstName(operation, 'Output')})`)
      }

      lines.push(`        .handler(${handlerFor(operation)}), ${requestFor(operation)}),`)
    }

    lines.push('    })),')
  }

  lines.push('  }')
  lines.push('}')
  lines.push('')

  return lines.join('\n')
}

function generateOutputFiles(
  document: OpenAPIDocument,
  config: Omit<GenerateOpenAPIConfig, 'input' | 'output'> = {}
): OutputFile[] {
  const apiImport = config.apiImport ?? '@hulla/api'
  const zodImport = config.zodImport ?? 'zod'
  validateLocalReferences(document)
  const componentSchemas = orderComponentSchemas(document.components?.schemas ?? {})
  const operations = collectOperations(document, config)
  const routeGroups = groupByOutputPath(operations)
  const files: OutputFile[] = [
    {
      path: 'types.ts',
      code: [
        "import type { ClientRequestOptions } from '@hulla/api/client'",
        '',
        'export type OpenAPIRequest = {',
        '  method: string',
        '  path: string',
        '  params?: unknown',
        '  query?: unknown',
        '  headers?: unknown',
        '  body?: unknown',
        '}',
        '',
        'export type OpenAPIClient = <T>(request: OpenAPIRequest, options?: ClientRequestOptions) => T | Promise<T>',
        '',
      ].join('\n'),
    },
  ]

  if (componentSchemas.length > 0) {
    const schemaLines = [`import { z } from ${quote(zodImport)}`, '']

    for (const component of componentSchemas) {
      schemaLines.push(componentSchemaDeclaration(component), '')
    }

    files.push({
      path: 'schemas.ts',
      code: schemaLines.join('\n'),
    })
  }

  for (const group of routeGroups) {
    files.push({
      path: join('routes', `${group.name}.ts`),
      code: generateRouteFile(group.operations, componentSchemas, zodImport),
    })
  }

  files.push({
    path: 'index.ts',
    code: generateOutputIndex(routeGroups, operations, apiImport, config.plugins, componentSchemas.length > 0),
  })

  return files
}

function generateOutputIndex(
  routeGroups: { name: string; operations: OperationModel[] }[],
  operations: OperationModel[],
  apiImport: string,
  plugins: readonly APIPlugin[] | undefined,
  hasComponentSchemas: boolean
): string {
  const lines = [
    `import { createApi } from ${quote(apiImport)}`,
    "import { clientProcedure } from '@hulla/api/client'",
    ...pluginImportLines(plugins),
    "import type { OpenAPIClient } from './types'",
  ]

  for (const group of routeGroups) {
    const imports = group.operations.flatMap((operation) => [
      ...(operation.inputSchema === undefined ? [] : [modularOperationConstName(operation, 'Input')]),
      ...(operation.outputSchema === undefined ? [] : [modularOperationConstName(operation, 'Output')]),
      operationHandlerName(operation),
    ])

    lines.push(`import { ${imports.join(', ')} } from './routes/${group.name}'`)
  }

  lines.push('', "export type { OpenAPIClient, OpenAPIRequest } from './types'")

  if (hasComponentSchemas) {
    lines.push("export * from './schemas'")
  }

  lines.push('', 'export function createOpenAPIClient(client: OpenAPIClient) {')
  lines.push(`  const api = ${createApiExpression(plugins)}`)
  lines.push('')
  lines.push('  return {')

  for (const router of groupByRouter(operations)) {
    lines.push(`    ${propertyKey(router.name)}: api.router(${quote(router.name)}).define(({ procedure }) => ({`)

    for (const operation of router.operations) {
      lines.push(`      ${propertyKey(operation.procedureName)}: clientProcedure(procedure`)

      if (operation.inputSchema !== undefined) {
        lines.push(`        .input(${modularOperationConstName(operation, 'Input')})`)
      }

      if (operation.outputSchema !== undefined) {
        lines.push(`        .output(${modularOperationConstName(operation, 'Output')})`)
      }

      lines.push(`        .handler(${operationHandlerName(operation)}(client)), ${requestFor(operation)}),`)
    }

    lines.push('    })),')
  }

  lines.push('  }')
  lines.push('}')
  lines.push('')

  return lines.join('\n')
}

function generateRouteFile(
  operations: OperationModel[],
  componentSchemas: ComponentSchema[],
  zodImport: string
): string {
  const lines = ["import type { OpenAPIClient } from '../types'"]
  const hasOperationSchemas = operations.some(
    (operation) => operation.inputSchema !== undefined || operation.outputSchema !== undefined
  )
  const usedComponentSchemas = componentSchemas
    .map(({ name }) => schemaConstName(name))
    .filter((name) =>
      operations.some(
        (operation) => schemaReferences(operation.inputSchema, name) || schemaReferences(operation.outputSchema, name)
      )
    )

  if (hasOperationSchemas) {
    lines.push(`import { z } from ${quote(zodImport)}`)
  }

  if (usedComponentSchemas.length > 0) {
    lines.push(`import { ${usedComponentSchemas.join(', ')} } from '../schemas'`)
  }

  lines.push('')

  for (const operation of operations) {
    if (operation.inputSchema !== undefined) {
      lines.push(`export const ${modularOperationConstName(operation, 'Input')} = ${operation.inputSchema}`, '')
    }

    if (operation.outputSchema !== undefined) {
      lines.push(`export const ${modularOperationConstName(operation, 'Output')} = ${operation.outputSchema}`, '')
    }

    lines.push(`export function ${operationHandlerName(operation)}(client: OpenAPIClient) {`)
    lines.push(`  return ${modularHandlerFor(operation)}`)
    lines.push('}')
    lines.push('')
  }

  return lines.join('\n')
}

async function readDocument(path: string): Promise<OpenAPIDocument> {
  const source = await readFile(path, 'utf8')
  const trimmed = source.trimStart()

  if (!trimmed.startsWith('{')) {
    throw new Error('Only JSON OpenAPI documents are supported in this first version.')
  }

  return JSON.parse(source) as OpenAPIDocument
}

function validateLocalReferences(document: OpenAPIDocument): void {
  const visited = new WeakSet<object>()

  const visit = (value: unknown): void => {
    if (typeof value !== 'object' || value === null || visited.has(value)) return
    visited.add(value)

    if (isReference(value)) {
      resolveJSONPointer(document, value.$ref)
      return
    }

    for (const nested of Object.values(value)) visit(nested)
  }

  visit(document)
}

function resolveReference<T>(
  document: OpenAPIDocument,
  value: T | ReferenceObject | undefined,
  description: string
): T | undefined {
  if (value === undefined || !isReference(value)) return value as T | undefined

  const seen = new Set<string>()
  let current: unknown = value

  while (isReference(current)) {
    if (seen.has(current.$ref)) {
      throw new Error(`Circular OpenAPI ${description} reference "${current.$ref}".`)
    }
    seen.add(current.$ref)
    current = resolveJSONPointer(document, current.$ref)
  }

  if (typeof current !== 'object' || current === null) {
    throw new Error(`OpenAPI ${description} reference must resolve to an object.`)
  }

  return current as T
}

function resolveJSONPointer(document: OpenAPIDocument, reference: string): unknown {
  if (!reference.startsWith('#/')) {
    throw new Error(
      `External OpenAPI reference "${reference}" is not supported. Bundle the document before generation.`
    )
  }

  let current: unknown = document

  for (const encodedPart of reference.slice(2).split('/')) {
    const part = decodeJSONPointerPart(encodedPart)

    if (typeof current !== 'object' || current === null || !(part in current)) {
      throw new Error(`OpenAPI reference "${reference}" could not be resolved.`)
    }
    current = (current as Record<string, unknown>)[part]
  }

  return current
}

function decodeJSONPointerPart(value: string): string {
  return value.replace(/~1/g, '/').replace(/~0/g, '~')
}

function orderComponentSchemas(schemas: Record<string, JSONSchema>): ComponentSchema[] {
  const ordered: string[] = []
  const state = new Map<string, 'visiting' | 'visited'>()
  const stack: string[] = []
  const recursive = new Set<string>()

  const visit = (name: string): void => {
    const currentState = state.get(name)

    if (currentState === 'visited') return
    if (currentState === 'visiting') {
      const cycleStart = stack.lastIndexOf(name)
      for (const cycleName of stack.slice(cycleStart)) recursive.add(cycleName)
      return
    }

    state.set(name, 'visiting')
    stack.push(name)

    for (const dependency of componentSchemaDependencies(schemas[name])) {
      if (dependency in schemas) visit(dependency)
    }

    stack.pop()
    state.set(name, 'visited')
    ordered.push(name)
  }

  for (const name of Object.keys(schemas)) visit(name)

  return ordered.map((name) => ({
    name,
    schema: schemas[name]!,
    recursive: recursive.has(name),
  }))
}

function componentSchemaDependencies(schema: JSONSchema | ReferenceObject | undefined): Set<string> {
  const dependencies = new Set<string>()
  const visited = new WeakSet<object>()

  const visit = (value: unknown): void => {
    if (typeof value !== 'object' || value === null || visited.has(value)) return
    visited.add(value)

    if (isReference(value)) {
      const prefix = '#/components/schemas/'
      if (value.$ref.startsWith(prefix)) dependencies.add(decodeJSONPointerPart(value.$ref.slice(prefix.length)))
      return
    }

    for (const nested of Object.values(value)) visit(nested)
  }

  visit(schema)
  return dependencies
}

function componentSchemaDeclaration(component: ComponentSchema): string {
  const name = schemaConstName(component.name)
  const schema = schemaToZod(component.schema)

  return component.recursive
    ? `export const ${name}: z.ZodType<unknown> = z.lazy(() => ${schema})`
    : `export const ${name} = ${schema}`
}

function collectOperations(
  document: OpenAPIDocument,
  config: Pick<GenerateOpenAPIConfig, 'operationNames'> = {}
): OperationModel[] {
  const operationNames = config.operationNames ?? 'operationId'
  const usedByRouter = new Map<string, Set<string>>()
  const operations: OperationModel[] = []

  for (const [path, pathItem] of Object.entries(document.paths)) {
    if (pathItem === undefined) {
      continue
    }

    for (const method of httpMethods) {
      const operation = pathItem[method]

      if (operation === undefined) {
        continue
      }

      const routerName = routerNameFor(path, operation)
      const rawProcedureName =
        operationNames === 'operationId' && operation.operationId !== undefined
          ? operation.operationId
          : procedureNameFromPath(method, path)
      const procedureName = uniqueName(camelCase(rawProcedureName), usedByRouter, routerName)
      const description = `${method.toUpperCase()} ${path}`
      const inputSchema = operationInputSchema(document, pathItem, operation, description)
      const outputSchema = operationOutputSchema(document, operation, description)

      operations.push({
        method,
        path,
        routerName,
        procedureName,
        inputSchema,
        outputSchema,
        outputType:
          outputSchema === undefined
            ? undefined
            : `z.input<typeof ${operationConstNameByName(procedureName, 'Output')}>`,
      })
    }
  }

  return operations
}

function operationInputSchema(
  document: OpenAPIDocument,
  pathItem: PathItem,
  operation: Operation,
  description: string
): string | undefined {
  const parameters = mergeParameters(document, pathItem.parameters ?? [], operation.parameters ?? [])
  validateOperationParameters(document, parameters, description)
  const parts: OperationInputPart[] = []

  for (const location of ['params', 'query', 'headers'] as const) {
    const openAPILocation = location === 'params' ? 'path' : location === 'headers' ? 'header' : 'query'
    const locationParameters = parameters.filter(
      (parameter): parameter is ParameterObject => isParameterObject(parameter) && parameter.in === openAPILocation
    )

    if (locationParameters.length === 0) {
      continue
    }

    const required = locationParameters.filter((parameter) => parameter.required).map((parameter) => parameter.name)
    const properties = locationParameters.map((parameter) => {
      return {
        name: parameter.name,
        schema: schemaToZod(parameter.schema ?? {}),
        required: required.includes(parameter.name),
      }
    })

    parts.push({
      key: location,
      schema: objectSchema(properties),
      required: required.length > 0,
    })
  }

  const requestBody = resolveReference<RequestBody>(document, operation.requestBody, 'request body')

  if (requestBody !== undefined) {
    const schema = requestBodySchema(requestBody.content, description)

    if (schema !== undefined) {
      parts.push({
        key: 'body',
        schema: schemaToZod(schema),
        required: requestBody.required === true,
      })
    }
  }

  if (parts.length === 0) {
    return undefined
  }

  return objectSchema(parts.map((part) => ({ name: part.key, schema: part.schema, required: part.required })))
}

function operationOutputSchema(
  document: OpenAPIDocument,
  operation: Operation,
  description: string
): string | undefined {
  const response = resolveReference<ResponseObject>(document, bestResponse(operation.responses), 'response')

  if (response === undefined) {
    return undefined
  }

  const schema = responseSchema(document, response.content, description)

  return schema === undefined ? undefined : schemaToZod(schema)
}

function mergeParameters(
  document: OpenAPIDocument,
  pathParameters: readonly Parameter[],
  operationParameters: readonly Parameter[]
): ParameterObject[] {
  const merged = new Map<string, ParameterObject>()

  for (const parameter of [...pathParameters, ...operationParameters]) {
    const resolved = resolveReference<ParameterObject>(document, parameter, 'parameter')

    if (resolved === undefined) continue

    merged.set(`${resolved.in}:${resolved.name}`, resolved)
  }

  return [...merged.values()]
}

function bestResponse(responses: Operation['responses']): ResponseObject | ReferenceObject | undefined {
  if (responses === undefined) {
    return undefined
  }

  const successStatus = Object.keys(responses)
    .filter((status) => /^[2][0-9][0-9]$/.test(status))
    .sort()[0]

  return successStatus === undefined ? responses['default'] : responses[successStatus]
}

function requestBodySchema(
  content: Record<string, MediaType | undefined> | undefined,
  description: string
): JSONSchema | ReferenceObject | undefined {
  if (content === undefined) return undefined
  const json = mediaTypeEntries(content).find(([mediaType]) => isJSONMediaType(mediaType))
  if (json) return json[1]?.schema
  const unsupported = mediaTypeEntries(content).filter(([, media]) => media?.schema !== undefined)
  if (unsupported.length > 0) {
    throw new Error(
      `OpenAPI operation ${description} uses an unsupported request body media type (${unsupported
        .map(([mediaType]) => mediaType)
        .join(', ')}); generated clients support JSON request bodies only.`
    )
  }
  return undefined
}

function responseSchema(
  document: OpenAPIDocument,
  content: Record<string, MediaType | undefined> | undefined,
  description: string
): JSONSchema | ReferenceObject | undefined {
  if (content === undefined) return undefined
  const entries = mediaTypeEntries(content)
  const json = entries.find(([mediaType]) => isJSONMediaType(mediaType))
  if (json) return json[1]?.schema
  const text = entries.find(([mediaType, media]) => mediaType.startsWith('text/') && media?.schema !== undefined)
  if (text) {
    if (schemaShape(document, text[1]!.schema) !== 'scalar-string') {
      throw new Error(`OpenAPI operation ${description} must describe text responses with a string schema.`)
    }
    return text[1]!.schema
  }
  const unsupported = entries.filter(([, media]) => media?.schema !== undefined)
  if (unsupported.length > 0) {
    throw new Error(
      `OpenAPI operation ${description} uses an unsupported response media type (${unsupported
        .map(([mediaType]) => mediaType)
        .join(', ')}).`
    )
  }
  return undefined
}

function mediaTypeEntries(content: Record<string, MediaType | undefined>): [string, MediaType | undefined][] {
  return Object.entries(content).map(([mediaType, media]) => [mediaType.toLowerCase(), media])
}

function isJSONMediaType(mediaType: string): boolean {
  const normalized = mediaType.split(';', 1)[0]!.trim()
  return normalized === 'application/json' || (normalized.startsWith('application/') && normalized.endsWith('+json'))
}

function validateOperationParameters(
  document: OpenAPIDocument,
  parameters: readonly ParameterObject[],
  description: string
): void {
  for (const parameter of parameters) {
    const owner = `OpenAPI operation ${description} parameter "${parameter.name}"`
    if (parameter.content !== undefined) throw new Error(`${owner} uses unsupported content-based serialization.`)
    if (parameter.in === 'cookie') throw new Error(`${owner} uses unsupported cookie transport.`)
    if (parameter.allowReserved === true) throw new Error(`${owner} uses unsupported allowReserved serialization.`)

    const shape = schemaShape(document, parameter.schema)
    if (shape === 'object' || shape === 'unknown') {
      throw new Error(`${owner} must use a supported scalar or repeated scalar array schema.`)
    }

    if (parameter.in === 'query') {
      if (parameter.style !== undefined && parameter.style !== 'form') {
        throw new Error(`${owner} uses unsupported query style "${parameter.style}".`)
      }
      if (parameter.explode === false) throw new Error(`${owner} uses unsupported explode: false serialization.`)
      if (shape === 'array' && schemaArrayItemShape(document, parameter.schema) !== 'scalar') {
        throw new Error(`${owner} must contain scalar array items.`)
      }
      continue
    }

    if (shape === 'array') throw new Error(`${owner} must use a scalar schema for ${parameter.in} transport.`)
    if (parameter.style !== undefined && parameter.style !== 'simple') {
      throw new Error(`${owner} uses unsupported ${parameter.in} style "${parameter.style}".`)
    }
    if (parameter.explode === true) throw new Error(`${owner} uses unsupported explode: true serialization.`)
  }
}

type SchemaShape = 'scalar' | 'scalar-string' | 'array' | 'object' | 'unknown'

function schemaShape(document: OpenAPIDocument, schema: JSONSchema | ReferenceObject | undefined): SchemaShape {
  const resolved = resolveReference<JSONSchema>(document, schema, 'parameter schema')
  if (resolved === undefined) return 'unknown'
  const types = Array.isArray(resolved.type) ? resolved.type.filter((type) => type !== 'null') : [resolved.type]
  if (types.length !== 1) return 'unknown'
  const [type] = types
  if (type === 'array') return 'array'
  if (type === 'object' || resolved.properties !== undefined || resolved.additionalProperties !== undefined)
    return 'object'
  if (type === 'string') return 'scalar-string'
  if (type === 'number' || type === 'integer' || type === 'boolean' || type === 'null') return 'scalar'
  if (resolved.enum !== undefined || resolved.const !== undefined) return 'scalar'
  return 'unknown'
}

function schemaArrayItemShape(
  document: OpenAPIDocument,
  schema: JSONSchema | ReferenceObject | undefined
): 'scalar' | 'unsupported' {
  const resolved = resolveReference<JSONSchema>(document, schema, 'array parameter schema')
  const item = schemaShape(document, resolved?.items)
  return item === 'scalar' || item === 'scalar-string' ? 'scalar' : 'unsupported'
}

function schemaToZod(schema: JSONSchema | ReferenceObject | undefined): string {
  if (schema === undefined) {
    return 'z.unknown()'
  }

  if (isReference(schema)) {
    const prefix = '#/components/schemas/'

    if (!schema.$ref.startsWith(prefix)) {
      throw new Error(`Schema reference "${schema.$ref}" must target #/components/schemas.`)
    }

    return schemaConstName(decodeJSONPointerPart(schema.$ref.slice(prefix.length)))
  }

  const nullable = schema.nullable === true || (Array.isArray(schema.type) && schema.type.includes('null'))
  const withoutNull = Array.isArray(schema.type) ? schema.type.filter((type) => type !== 'null') : schema.type
  const base = schemaToBaseZod({ ...schema, type: withoutNull })

  return nullable ? `${base}.nullable()` : base
}

function schemaToBaseZod(schema: JSONSchema): string {
  if (schema.const !== undefined) {
    return `z.literal(${JSON.stringify(schema.const)})`
  }

  if (schema.enum !== undefined) {
    return enumToZod(schema.enum)
  }

  if (schema.allOf !== undefined && schema.allOf.length > 0) {
    return schema.allOf.map(schemaToZod).reduce((left, right) => `z.intersection(${left}, ${right})`)
  }

  if (schema.oneOf !== undefined && schema.oneOf.length > 0) {
    return unionToZod(schema.oneOf)
  }

  if (schema.anyOf !== undefined && schema.anyOf.length > 0) {
    return unionToZod(schema.anyOf)
  }

  if (Array.isArray(schema.type)) {
    return unionToZod(schema.type.map((type) => ({ ...schema, type })))
  }

  switch (schema.type) {
    case 'array':
      return `z.array(${schemaToZod(schema.items)})`
    case 'boolean':
      return 'z.boolean()'
    case 'integer':
      return 'z.number().int()'
    case 'number':
      return 'z.number()'
    case 'object':
      return objectSchemaFromJSONSchema(schema)
    case 'string':
      return stringSchema(schema.format)
    case 'null':
      return 'z.null()'
    default:
      if (schema.properties !== undefined || schema.additionalProperties !== undefined) {
        return objectSchemaFromJSONSchema(schema)
      }

      return 'z.unknown()'
  }
}

function objectSchemaFromJSONSchema(schema: JSONSchema): string {
  const properties = Object.entries(schema.properties ?? {}).map(([name, property]) => ({
    name,
    schema: schemaToZod(property),
    required: schema.required?.includes(name) === true,
  }))

  if (properties.length === 0 && typeof schema.additionalProperties === 'object') {
    return `z.record(z.string(), ${schemaToZod(schema.additionalProperties)})`
  }

  let result = objectSchema(properties)

  if (schema.additionalProperties === false) {
    result += '.strict()'
  } else if (typeof schema.additionalProperties === 'object') {
    result += `.catchall(${schemaToZod(schema.additionalProperties)})`
  }

  return result
}

function objectSchema(properties: { name: string; schema: string; required: boolean }[]): string {
  if (properties.length === 0) {
    return 'z.object({})'
  }

  const lines = ['z.object({']

  for (const property of properties) {
    lines.push(
      `  ${propertyKey(property.name)}: ${property.required ? property.schema : `${property.schema}.optional()`},`
    )
  }

  lines.push('})')

  return lines.join('\n')
}

function enumToZod(values: readonly unknown[]): string {
  if (values.length === 0) {
    return 'z.never()'
  }

  if (values.every((value) => typeof value === 'string')) {
    if (values.length === 1) {
      return `z.literal(${quote(values[0] as string)})`
    }

    return `z.enum([${values.map((value) => quote(value as string)).join(', ')}])`
  }

  if (values.length === 1) {
    return `z.literal(${JSON.stringify(values[0])})`
  }

  return `z.union([${values.map((value) => `z.literal(${JSON.stringify(value)})`).join(', ')}])`
}

function unionToZod(schemas: readonly (JSONSchema | ReferenceObject)[]): string {
  if (schemas.length === 1) {
    return schemaToZod(schemas[0])
  }

  return `z.union([${schemas.map(schemaToZod).join(', ')}])`
}

function stringSchema(format: string | undefined): string {
  switch (format) {
    case 'date-time':
      return 'z.string().datetime()'
    case 'email':
      return 'z.string().email()'
    case 'uri':
    case 'url':
      return 'z.string().url()'
    case 'uuid':
      return 'z.string().uuid()'
    default:
      return 'z.string()'
  }
}

function handlerFor(operation: OperationModel): string {
  const request = [
    `method: ${quote(operation.method.toUpperCase())}`,
    `path: ${quote(operation.path)}`,
    ...(operation.inputSchema === undefined ? [] : ['...input']),
  ].join(', ')
  const call = `client${operation.outputType === undefined ? '' : `<${operation.outputType}>`}({ ${request} })`

  return operation.inputSchema === undefined ? `() => ${call}` : `({ input }) => ${call}`
}

function requestFor(operation: OperationModel): string {
  const request = [
    `method: ${quote(operation.method.toUpperCase())}`,
    `path: ${quote(operation.path)}`,
    ...(operation.inputSchema === undefined ? [] : ['...input']),
  ].join(', ')
  const call = `client({ ${request} }, options)`

  return operation.inputSchema === undefined ? `(options) => ${call}` : `(options, input) => ${call}`
}

function modularHandlerFor(operation: OperationModel): string {
  const request = [
    `method: ${quote(operation.method.toUpperCase())}`,
    `path: ${quote(operation.path)}`,
    ...(operation.inputSchema === undefined ? [] : ['...input']),
  ].join(', ')
  const outputType =
    operation.outputSchema === undefined ? '' : `<z.input<typeof ${modularOperationConstName(operation, 'Output')}>>`
  const call = `client${outputType}({ ${request} })`

  if (operation.inputSchema === undefined) {
    return `() => ${call}`
  }

  return `({ input }: { input: z.input<typeof ${modularOperationConstName(operation, 'Input')}> }) => ${call}`
}

function groupByRouter(operations: OperationModel[]): { name: string; operations: OperationModel[] }[] {
  const routers = new Map<string, OperationModel[]>()

  for (const operation of operations) {
    const routerOperations = routers.get(operation.routerName) ?? []

    routerOperations.push(operation)
    routers.set(operation.routerName, routerOperations)
  }

  return [...routers.entries()].map(([name, routerOperations]) => ({ name, operations: routerOperations }))
}

function groupByOutputPath(operations: OperationModel[]): { name: string; operations: OperationModel[] }[] {
  const groups = new Map<string, OperationModel[]>()

  for (const operation of operations) {
    const name = outputPathGroupName(operation.path)
    const groupOperations = groups.get(name) ?? []

    groupOperations.push(operation)
    groups.set(name, groupOperations)
  }

  return [...groups.entries()].map(([name, groupOperations]) => ({ name, operations: groupOperations }))
}

function routerNameFor(path: string, operation: Operation): string {
  const tag = operation.tags?.[0]

  if (tag !== undefined && tag.length > 0) {
    return camelCase(tag)
  }

  return camelCase(path.split('/').find((part) => part.length > 0 && !part.startsWith('{')) ?? 'api')
}

function procedureNameFromPath(method: HTTPMethod, path: string): string {
  return camelCase([method, ...pathTokens(path)].join(' '))
}

function pathTokens(path: string): string[] {
  return path
    .split('/')
    .filter((part) => part.length > 0)
    .map((part) => part.replace(/^\{(.+)\}$/, '$1'))
}

function uniqueName(name: string, usedByRouter: Map<string, Set<string>>, routerName: string): string {
  const used = usedByRouter.get(routerName) ?? new Set<string>()
  let nextName = name
  let suffix = 2

  while (used.has(nextName)) {
    nextName = `${name}${suffix}`
    suffix += 1
  }

  used.add(nextName)
  usedByRouter.set(routerName, used)

  return nextName
}

function operationConstName(operation: Pick<OperationModel, 'procedureName'>, suffix: string): string {
  return operationConstNameByName(operation.procedureName, suffix)
}

function operationConstNameByName(name: string, suffix: string): string {
  return `${pascalCase(name)}${suffix}Schema`
}

function modularOperationConstName(
  operation: Pick<OperationModel, 'routerName' | 'procedureName'>,
  suffix: string
): string {
  return `${pascalCase(operation.routerName)}${pascalCase(operation.procedureName)}${suffix}Schema`
}

function operationHandlerName(operation: Pick<OperationModel, 'routerName' | 'procedureName'>): string {
  return `${camelCase(`${operation.routerName} ${operation.procedureName}`)}Handler`
}

function schemaConstName(name: string): string {
  return `${pascalCase(name)}Schema`
}

function outputPathGroupName(path: string): string {
  return kebabCase(path.split('/').find((part) => part.length > 0 && !part.startsWith('{')) ?? 'root')
}

function kebabCase(value: string): string {
  return (
    wordsFor(value)
      .map((word) => word.toLowerCase())
      .join('-') || 'api'
  )
}

function camelCase(value: string): string {
  const words = wordsFor(value)
  const [first = 'value', ...rest] = words

  return [first.toLowerCase(), ...rest.map(capitalize)].join('')
}

function pascalCase(value: string): string {
  return wordsFor(value).map(capitalize).join('') || 'Schema'
}

function wordsFor(value: string): string[] {
  const spaced = value
    .replace(/([a-z0-9])([A-Z])/g, '$1 $2')
    .replace(/[^a-zA-Z0-9]+/g, ' ')
    .trim()

  return spaced.length === 0 ? [] : spaced.split(/\s+/)
}

function capitalize(value: string): string {
  return `${value.slice(0, 1).toUpperCase()}${value.slice(1).toLowerCase()}`
}

function propertyKey(value: string): string {
  return /^[a-zA-Z_$][a-zA-Z0-9_$]*$/.test(value) ? value : quote(value)
}

function quote(value: string): string {
  return JSON.stringify(value)
}

function schemaReferences(schema: string | undefined, name: string): boolean {
  return schema !== undefined && new RegExp(`\\b${escapeRegExp(name)}\\b`).test(schema)
}

function escapeRegExp(value: string): string {
  return value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
}

function isReference(value: unknown): value is ReferenceObject {
  return typeof value === 'object' && value !== null && '$ref' in value && typeof value.$ref === 'string'
}

function isParameterObject(parameter: Parameter): parameter is ParameterObject {
  return !isReference(parameter)
}
