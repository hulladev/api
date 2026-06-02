import { mkdir, readFile, stat, writeFile } from 'node:fs/promises'
import { dirname, extname, join } from 'node:path'

export type OperationNameMode = 'operationId' | 'path'

export type GenerateOpenAPIConfig = {
  input: string | OpenAPIDocument
  output?: string
  operationNames?: OperationNameMode
  apiImport?: string
  zodImport?: string
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
  }
  paths: Record<string, PathItem | undefined>
}

type HTTPMethod = 'get' | 'put' | 'post' | 'delete' | 'options' | 'head' | 'patch' | 'trace'

type PathItem = Partial<Record<HTTPMethod, Operation>> & {
  parameters?: Parameter[]
}

type Operation = {
  operationId?: string
  tags?: string[]
  parameters?: Parameter[]
  requestBody?: RequestBody | ReferenceObject
  responses?: Record<string, ResponseObject | ReferenceObject | undefined>
}

type Parameter = ReferenceObject | ParameterObject

type ParameterObject = {
  name: string
  in: 'query' | 'header' | 'path' | 'cookie'
  required?: boolean
  schema?: JSONSchema | ReferenceObject
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
  enum?: unknown[]
  const?: unknown
  nullable?: boolean
  properties?: Record<string, JSONSchema | ReferenceObject | undefined>
  required?: string[]
  items?: JSONSchema | ReferenceObject
  additionalProperties?: boolean | JSONSchema | ReferenceObject
  oneOf?: (JSONSchema | ReferenceObject)[]
  anyOf?: (JSONSchema | ReferenceObject)[]
  allOf?: (JSONSchema | ReferenceObject)[]
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

const httpMethods = ['get', 'post', 'put', 'patch', 'delete', 'options', 'head', 'trace'] as const

export function defineConfig<const T extends GenerateOpenAPIConfig>(config: T): T {
  return config
}

export async function generate(config: GenerateOpenAPIConfig): Promise<GenerateOpenAPIResult> {
  const document = typeof config.input === 'string' ? await readDocument(config.input) : config.input
  const code = generateCode(document, config)

  if (config.output !== undefined) {
    await writeOutput(config.output, code, document, config)
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
  const apiImport = config.apiImport ?? '@hulla/api'
  const zodImport = config.zodImport ?? 'zod'
  const componentSchemas = Object.entries(document.components?.schemas ?? {})
  const operations = collectOperations(document, config)
  const lines: string[] = [
    `import { init } from ${quote(apiImport)}`,
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
    'export type OpenAPIClient = <T>(request: OpenAPIRequest) => T | Promise<T>',
    '',
  ]

  for (const [name, schema] of componentSchemas) {
    lines.push(`export const ${schemaConstName(name)} = ${schemaToZod(schema)}`, '')
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
  lines.push('  const api = init()')
  lines.push('')
  lines.push('  return {')

  for (const router of groupByRouter(operations)) {
    lines.push(`    ${propertyKey(router.name)}: api.router(${quote(router.name)}).define(({ procedure }) => ({`)

    for (const operation of router.operations) {
      lines.push(`      ${propertyKey(operation.procedureName)}: procedure`)

      if (operation.inputSchema !== undefined) {
        lines.push(`        .input(${operationConstName(operation, 'Input')})`)
      }

      if (operation.outputSchema !== undefined) {
        lines.push(`        .output(${operationConstName(operation, 'Output')})`)
      }

      lines.push(`        .handler(${handlerFor(operation)}),`)
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
  const componentSchemas = Object.entries(document.components?.schemas ?? {})
  const operations = collectOperations(document, config)
  const routeGroups = groupByOutputPath(operations)
  const files: OutputFile[] = [
    {
      path: 'types.ts',
      code: [
        'export type OpenAPIRequest = {',
        '  method: string',
        '  path: string',
        '  params?: unknown',
        '  query?: unknown',
        '  headers?: unknown',
        '  body?: unknown',
        '}',
        '',
        'export type OpenAPIClient = <T>(request: OpenAPIRequest) => T | Promise<T>',
        '',
      ].join('\n'),
    },
  ]

  if (componentSchemas.length > 0) {
    const schemaLines = [`import { z } from ${quote(zodImport)}`, '']

    for (const [name, schema] of componentSchemas) {
      schemaLines.push(`export const ${schemaConstName(name)} = ${schemaToZod(schema)}`, '')
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
    code: generateOutputIndex(routeGroups, operations, apiImport, componentSchemas.length > 0),
  })

  return files
}

function generateOutputIndex(
  routeGroups: { name: string; operations: OperationModel[] }[],
  operations: OperationModel[],
  apiImport: string,
  hasComponentSchemas: boolean
): string {
  const lines = [`import { init } from ${quote(apiImport)}`, "import type { OpenAPIClient } from './types'"]

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
  lines.push('  const api = init()')
  lines.push('')
  lines.push('  return {')

  for (const router of groupByRouter(operations)) {
    lines.push(`    ${propertyKey(router.name)}: api.router(${quote(router.name)}).define(({ procedure }) => ({`)

    for (const operation of router.operations) {
      lines.push(`      ${propertyKey(operation.procedureName)}: procedure`)

      if (operation.inputSchema !== undefined) {
        lines.push(`        .input(${modularOperationConstName(operation, 'Input')})`)
      }

      if (operation.outputSchema !== undefined) {
        lines.push(`        .output(${modularOperationConstName(operation, 'Output')})`)
      }

      lines.push(`        .handler(${operationHandlerName(operation)}(client)),`)
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
  componentSchemas: [string, JSONSchema][],
  zodImport: string
): string {
  const lines = ["import type { OpenAPIClient } from '../types'"]
  const hasOperationSchemas = operations.some(
    (operation) => operation.inputSchema !== undefined || operation.outputSchema !== undefined
  )
  const usedComponentSchemas = componentSchemas
    .map(([name]) => schemaConstName(name))
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

async function writeOutput(
  output: string,
  code: string,
  document: OpenAPIDocument,
  config: Omit<GenerateOpenAPIConfig, 'input'>
): Promise<void> {
  if ((await outputKind(output)) === 'file') {
    await writeFile(output, code)
    return
  }

  await mkdir(output, { recursive: true })

  for (const file of generateOutputFiles(document, config)) {
    const filePath = join(output, file.path)

    await mkdir(dirname(filePath), { recursive: true })
    await writeFile(filePath, file.code)
  }
}

async function outputKind(output: string): Promise<'file' | 'directory'> {
  try {
    return (await stat(output)).isDirectory() ? 'directory' : 'file'
  } catch (error) {
    if (isErrorCode(error, 'ENOENT')) {
      return looksLikeDirectoryOutput(output) ? 'directory' : 'file'
    }

    throw error
  }
}

async function readDocument(path: string): Promise<OpenAPIDocument> {
  const source = await readFile(path, 'utf8')
  const trimmed = source.trimStart()

  if (!trimmed.startsWith('{')) {
    throw new Error('Only JSON OpenAPI documents are supported in this first version.')
  }

  return JSON.parse(source) as OpenAPIDocument
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
      const inputSchema = operationInputSchema(pathItem, operation)
      const outputSchema = operationOutputSchema(operation)

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

function operationInputSchema(pathItem: PathItem, operation: Operation): string | undefined {
  const parameters = mergeParameters(pathItem.parameters ?? [], operation.parameters ?? [])
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

  const requestBody = dereferenceRequestBody(operation.requestBody)

  if (requestBody !== undefined) {
    const schema = mediaTypeSchema(requestBody.content)

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

function operationOutputSchema(operation: Operation): string | undefined {
  const response = bestResponse(operation.responses)

  if (response === undefined || isReference(response)) {
    return undefined
  }

  const schema = mediaTypeSchema(response.content)

  return schema === undefined ? undefined : schemaToZod(schema)
}

function mergeParameters(pathParameters: Parameter[], operationParameters: Parameter[]): Parameter[] {
  const merged = new Map<string, Parameter>()

  for (const parameter of [...pathParameters, ...operationParameters]) {
    if (isReference(parameter)) {
      continue
    }

    merged.set(`${parameter.in}:${parameter.name}`, parameter)
  }

  return [...merged.values()]
}

function dereferenceRequestBody(requestBody: RequestBody | ReferenceObject | undefined): RequestBody | undefined {
  return requestBody === undefined || isReference(requestBody) ? undefined : requestBody
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

function mediaTypeSchema(
  content: Record<string, MediaType | undefined> | undefined
): JSONSchema | ReferenceObject | undefined {
  if (content === undefined) {
    return undefined
  }

  return (
    content['application/json']?.schema ??
    Object.values(content).find((mediaType) => mediaType?.schema !== undefined)?.schema
  )
}

function schemaToZod(schema: JSONSchema | ReferenceObject | undefined): string {
  if (schema === undefined) {
    return 'z.unknown()'
  }

  if (isReference(schema)) {
    return schemaConstName(schema.$ref.split('/').at(-1) ?? 'Schema')
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
    return `z.record(${schemaToZod(schema.additionalProperties)})`
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

function enumToZod(values: unknown[]): string {
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

function unionToZod(schemas: (JSONSchema | ReferenceObject)[]): string {
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

function looksLikeDirectoryOutput(output: string): boolean {
  return /[\\/]$/.test(output) || extname(output) === ''
}

function isErrorCode(error: unknown, code: string): boolean {
  return error instanceof Error && 'code' in error && error.code === code
}

function isReference<T extends object>(value: T | ReferenceObject): value is ReferenceObject {
  return '$ref' in value
}

function isParameterObject(parameter: Parameter): parameter is ParameterObject {
  return !isReference(parameter)
}
