import {
  compileContract,
  type AnyErrorDeclaration,
  type AnyRequestBody,
  type AnyRouteResponse,
  type CompiledContractRoute,
  type Contract,
  type Route,
} from '@hulla/api'
import type { StandardSchemaV1 } from '@standard-schema/spec'
import { extractOpenAPIDocstrings, type OpenAPIDocstring, type OpenAPIDocstrings } from './docstrings'
import { standardSchemaInput } from './schema'
import type {
  DefinedOpenAPI,
  IncludedOpenAPIRouteDocumentation,
  OpenAPIErrorResponseDocumentation,
  OpenAPIParameterDocumentation,
  OpenAPIResponseDocumentation,
} from './sidecar'
import type {
  ExampleObject,
  JSONSchema,
  MediaTypeObject,
  OpenAPIDocument,
  OperationObject,
  ParameterObject,
  PathItemObject,
  ResponseObject,
  RequestBodyObject,
} from './types'

type RuntimeRouteDocumentation = IncludedOpenAPIRouteDocumentation<Route, Contract['errors']>
type RuntimeParameterDocumentation = Readonly<Record<string, OpenAPIParameterDocumentation | undefined>>
type RuntimeRequestDocumentation = {
  readonly path?: RuntimeParameterDocumentation
  readonly query?: RuntimeParameterDocumentation
  readonly headers?: RuntimeParameterDocumentation
  readonly body?: {
    readonly description?: string
    readonly required?: boolean
    readonly schema?: JSONSchema
    readonly examples?: Readonly<
      Record<
        string,
        {
          readonly summary?: string
          readonly description?: string
          readonly value?: unknown
          readonly externalValue?: string
        }
      >
    >
    readonly extensions?: Readonly<Record<`x-${string}`, unknown>>
  }
}

function record(value: unknown): value is Readonly<Record<string, unknown>> {
  return typeof value === 'object' && value !== null && !Array.isArray(value)
}

function extensions(value: {
  readonly extensions?: Readonly<Record<`x-${string}`, unknown>>
}): Record<string, unknown> {
  return value.extensions === undefined ? {} : { ...value.extensions }
}

function routeDocumentation(definition: DefinedOpenAPI, key: readonly string[]): unknown {
  let current: unknown = definition.documentation.routes
  for (const part of key) {
    if (!record(current) || !(part in current)) return undefined
    current = current[part]
  }
  return current
}

function assertExactKeys(actual: readonly string[], expected: readonly string[], location: string): void {
  const actualSet = new Set(actual)
  const expectedSet = new Set(expected)
  const missing = expected.filter((key) => !actualSet.has(key))
  const extra = actual.filter((key) => !expectedSet.has(key))
  if (missing.length > 0 || extra.length > 0) {
    const details = [
      ...(missing.length === 0 ? [] : [`missing ${missing.map((key) => JSON.stringify(key)).join(', ')}`]),
      ...(extra.length === 0 ? [] : [`unknown ${extra.map((key) => JSON.stringify(key)).join(', ')}`]),
    ].join('; ')
    throw new TypeError(`${location} does not match the contract (${details})`)
  }
}

function validateDocumentation(definition: DefinedOpenAPI): void {
  const compiled = compileContract(definition.contract)
  const expectedTop = [...new Set(compiled.routes.map(({ key }) => (key as readonly string[])[0]!))]
  assertExactKeys(Object.keys(definition.documentation.routes), expectedTop, 'OpenAPI routes')

  for (const top of expectedTop) {
    const routes = compiled.routes.filter(({ key }) => (key as readonly string[])[0] === top)
    if (routes.every(({ key }) => (key as readonly string[]).length === 2)) {
      const value = definition.documentation.routes[top]
      if (!record(value)) throw new TypeError(`OpenAPI routes.${top} must document its router routes`)
      assertExactKeys(
        Object.keys(value),
        routes.map(({ key }) => (key as readonly string[])[1]!),
        `OpenAPI routes.${top}`
      )
    }
  }

  for (const compiledRoute of compiled.routes) {
    const value = routeDocumentation(definition, compiledRoute.key)
    const location = `OpenAPI routes.${compiledRoute.key.join('.')}`
    if (!record(value)) throw new TypeError(`${location} must be documented or explicitly excluded`)
    if (value['include'] === false) {
      if (typeof value['reason'] !== 'string' || value['reason'].length === 0) {
        throw new TypeError(`${location} exclusion must include a reason`)
      }
      continue
    }
    if (!record(value['responses'])) throw new TypeError(`${location}.responses must document every response`)
    const expectedStatuses = [
      ...new Set([...Object.keys(definition.contract.errors), ...Object.keys(compiledRoute.route.responses)]),
    ].sort((left, right) => Number(left) - Number(right))
    assertExactKeys(Object.keys(value['responses']), expectedStatuses, `${location}.responses`)
  }
}

function openAPIPath(path: string): string {
  return path.replace(/:([A-Za-z_$][\w$]*)/g, '{$1}') || '/'
}

function schemaObject(schema: JSONSchema, location: string): Exclude<JSONSchema, boolean> {
  if (schema === true) return {}
  if (schema === false) return { not: {} }
  if (!record(schema)) throw new TypeError(`${location} must produce an object JSON Schema`)
  return schema
}

function propertySchema(objectSchema: Exclude<JSONSchema, boolean>, name: string, location: string): JSONSchema {
  const properties = objectSchema.properties
  const schema = properties?.[name]
  if (schema === undefined) throw new Error(`${location} JSON Schema does not declare property "${name}"`)
  const definitions = objectSchema.$defs
  if (definitions === undefined || typeof schema === 'boolean') return schema
  return { ...schema, $defs: definitions }
}

function exampleObjects(
  examples:
    | Readonly<
        Record<
          string,
          {
            readonly summary?: string
            readonly description?: string
            readonly value?: unknown
            readonly externalValue?: string
          }
        >
      >
    | undefined
): Readonly<Record<string, ExampleObject>> | undefined {
  if (examples === undefined) return undefined
  return Object.fromEntries(Object.entries(examples).map(([name, example]) => [name, { ...example }]))
}

function parameterObject(
  name: string,
  location: 'path' | 'query' | 'header',
  schema: JSONSchema,
  required: boolean,
  documentation: OpenAPIParameterDocumentation | undefined
): ParameterObject {
  const object: ParameterObject = {
    name,
    in: location,
    required: location === 'path' ? true : required,
    ...(documentation?.description === undefined ? {} : { description: documentation.description }),
    ...(documentation?.deprecated === undefined ? {} : { deprecated: documentation.deprecated }),
    ...(documentation?.example === undefined ? {} : { example: documentation.example }),
    ...(location === 'query' && record(schema) && schema['type'] === 'array' ? { style: 'form', explode: true } : {}),
    schema,
    ...extensions(documentation ?? {}),
  }
  return object
}

function schemaParameters(
  schema: StandardSchemaV1,
  location: 'query' | 'header',
  documentation: RuntimeParameterDocumentation | undefined,
  owner: string
): ParameterObject[] {
  const jsonSchema = schemaObject(standardSchemaInput(schema, owner), owner)
  const properties = jsonSchema.properties
  if (properties === undefined) throw new Error(`${owner} must convert to a JSON Schema object with properties`)
  const required = new Set(jsonSchema.required ?? [])
  return Object.keys(properties).map((name) =>
    parameterObject(name, location, propertySchema(jsonSchema, name, owner), required.has(name), documentation?.[name])
  )
}

function pathParameters(
  compiled: CompiledContractRoute,
  documentation: RuntimeParameterDocumentation | undefined,
  owner: string
): ParameterObject[] {
  const parameters: ParameterObject[] = []
  for (const declaration of compiled.pathParameters) {
    const declarationOwner = `${owner} path parameters at ${declaration.path}`
    const jsonSchema = schemaObject(standardSchemaInput(declaration.schema, declarationOwner), declarationOwner)
    const required = new Set(jsonSchema.required ?? [])
    for (const name of declaration.names) {
      parameters.push(
        parameterObject(
          name,
          'path',
          propertySchema(jsonSchema, name, declarationOwner),
          required.has(name),
          documentation?.[name]
        )
      )
    }
  }
  return parameters
}

function requestBody(
  body: AnyRequestBody,
  documentation: RuntimeRequestDocumentation['body'],
  owner: string
): RequestBodyObject {
  if (documentation?.required === false) {
    throw new Error(`${owner} request body is required by the @hulla/api contract and cannot be optional in OpenAPI`)
  }
  const fallback =
    body.representation === 'bytes'
      ? ({ type: 'string', format: 'binary' } as const)
      : body.representation === 'text'
        ? ({ type: 'string' } as const)
        : body.representation === 'json'
          ? ({} as const)
          : undefined
  const schema = documentation?.schema ?? standardSchemaInput(body.schema, `${owner} request body`, fallback)
  const examples = exampleObjects(documentation?.examples)
  const media: MediaTypeObject = {
    schema,
    ...(examples === undefined ? {} : { examples }),
  }
  return {
    ...(documentation?.description === undefined ? {} : { description: documentation.description }),
    required: true,
    content: { [body.contentType]: media },
    ...extensions(documentation ?? {}),
  }
}

function responseHeaders(
  schema: StandardSchemaV1,
  documentation: RuntimeParameterDocumentation | undefined,
  owner: string
): ResponseObject['headers'] {
  const jsonSchema = schemaObject(standardSchemaInput(schema, owner), owner)
  const properties = jsonSchema.properties
  if (properties === undefined) throw new Error(`${owner} must convert to a JSON Schema object with properties`)
  const required = new Set(jsonSchema.required ?? [])
  return Object.fromEntries(
    Object.keys(properties).map((name) => {
      const parameter = parameterObject(
        name,
        'header',
        propertySchema(jsonSchema, name, owner),
        required.has(name),
        documentation?.[name]
      )
      const { name: _name, in: _in, ...header } = parameter
      return [name, header]
    })
  )
}

function responseObject(
  response: AnyRouteResponse,
  documentation: OpenAPIResponseDocumentation,
  owner: string
): ResponseObject {
  const body = response.body
  let content: ResponseObject['content']
  if (body.kind !== 'empty') {
    if (body.kind === 'stream' && documentation.schema === undefined) {
      throw new Error(`${owner} is streamed and needs an explicit OpenAPI schema for the complete response`)
    }
    if (response.contentType === undefined) {
      if (documentation.schema === undefined) {
        throw new Error(`${owner} uses a raw response and needs an explicit OpenAPI response schema`)
      }
      content = { 'application/octet-stream': { schema: documentation.schema } }
    } else {
      const fallback =
        body.kind === 'bytes'
          ? ({ type: 'string', format: 'binary' } as const)
          : body.kind === 'text'
            ? ({ type: 'string' } as const)
            : body.kind === 'json'
              ? ({} as const)
              : undefined
      const schema =
        documentation.schema ??
        ('schema' in body
          ? standardSchemaInput(body.schema, `${owner} body`, fallback)
          : (() => {
              throw new Error(`${owner} needs an explicit OpenAPI response schema`)
            })())
      const examples = exampleObjects(documentation.examples)
      content = {
        [response.contentType]: {
          schema,
          ...(examples === undefined ? {} : { examples }),
        },
      }
    }
  }

  const headers =
    response.headers === undefined
      ? undefined
      : responseHeaders(response.headers, documentation.headers, `${owner} headers`)
  return {
    description: documentation.description,
    ...(headers === undefined ? {} : { headers }),
    ...(content === undefined ? {} : { content }),
    ...extensions(documentation),
  }
}

function errorResponseObject(
  declarations: readonly AnyErrorDeclaration[],
  documentation: OpenAPIErrorResponseDocumentation<readonly AnyErrorDeclaration[]>,
  owner: string
): ResponseObject {
  const variants = declarations.map((declaration): JSONSchema => {
    const data = declaration.data
    return {
      type: 'object',
      properties: {
        code: { const: declaration.code },
        message: { type: 'string' },
        ...(data === undefined ? {} : { data: standardSchemaInput(data, `${owner} ${declaration.code} data`) }),
      },
      required: data === undefined ? ['code', 'message'] : ['code', 'message', 'data'],
      additionalProperties: false,
    }
  })
  const schema = documentation.schema ?? (variants.length === 1 ? variants[0]! : { oneOf: variants })
  const examples = exampleObjects(documentation.examples)
  return {
    description: documentation.description,
    content: {
      'application/json': {
        schema,
        ...(examples === undefined ? {} : { examples }),
      },
    },
    ...extensions(documentation),
  }
}

function mergedRouteDocumentation(
  documentation: RuntimeRouteDocumentation,
  docstring: OpenAPIDocstring | undefined
): RuntimeRouteDocumentation {
  return {
    ...documentation,
    ...(documentation.summary !== undefined || docstring?.summary === undefined ? {} : { summary: docstring.summary }),
    ...(documentation.description !== undefined || docstring?.description === undefined
      ? {}
      : { description: docstring.description }),
    ...(documentation.tags !== undefined || docstring?.tags === undefined ? {} : { tags: docstring.tags }),
    ...(documentation.deprecated !== undefined || docstring?.deprecated === undefined
      ? {}
      : { deprecated: docstring.deprecated }),
  }
}

function operationFor(
  definition: DefinedOpenAPI,
  compiled: CompiledContractRoute,
  rawDocumentation: RuntimeRouteDocumentation,
  docstrings: OpenAPIDocstrings
): OperationObject {
  const documentation = mergedRouteDocumentation(rawDocumentation, docstrings[compiled.key.join('.')])
  const route = compiled.route
  const owner = `${route.method} ${compiled.path}`
  const requestDocumentation = documentation.request as RuntimeRequestDocumentation | undefined
  const parameters = [
    ...pathParameters(compiled, requestDocumentation?.path, owner),
    ...('query' in route && route.query !== undefined
      ? schemaParameters(route.query, 'query', requestDocumentation?.query, `${owner} query`)
      : []),
    ...('headers' in route && route.headers !== undefined
      ? schemaParameters(route.headers, 'header', requestDocumentation?.headers, `${owner} headers`)
      : []),
  ]
  const declaredErrors = Object.entries(definition.contract.errors).map(([status, declarations]) => [
    status,
    errorResponseObject(
      declarations,
      documentation.responses[Number(status)] as OpenAPIErrorResponseDocumentation<readonly AnyErrorDeclaration[]>,
      `${owner} response ${status}`
    ),
  ])
  const routeResponses = Object.entries(route.responses).map(([status, response]) => [
    status,
    responseObject(response, documentation.responses[Number(status)]!, `${owner} response ${status}`),
  ])
  const responses = Object.fromEntries([...declaredErrors, ...routeResponses])

  return {
    ...(documentation.tags === undefined ? {} : { tags: documentation.tags }),
    ...(documentation.summary === undefined ? {} : { summary: documentation.summary }),
    ...(documentation.description === undefined ? {} : { description: documentation.description }),
    ...(documentation.externalDocs === undefined ? {} : { externalDocs: documentation.externalDocs }),
    operationId: documentation.operationId ?? compiled.key.join('_'),
    ...(parameters.length === 0 ? {} : { parameters }),
    ...('body' in route && route.body !== undefined
      ? { requestBody: requestBody(route.body, requestDocumentation?.body, owner) }
      : {}),
    responses,
    ...(documentation.deprecated === undefined ? {} : { deprecated: documentation.deprecated }),
    ...(documentation.security === undefined ? {} : { security: documentation.security }),
    ...extensions(documentation),
  }
}

function operationMethod(method: Route['method'], version: string): keyof PathItemObject {
  const name = method.toLowerCase()
  if (name === 'query' && !version.startsWith('3.2')) {
    throw new Error('OpenAPI 3.1 cannot represent HTTP QUERY routes; exclude the route or select OpenAPI 3.2.0')
  }
  return name as keyof PathItemObject
}

/** Generates an OpenAPI document from a contract and its separate documentation sidecar. */
export async function createOpenAPIDocument(definition: DefinedOpenAPI): Promise<OpenAPIDocument> {
  if (definition.kind !== 'hulla-openapi') throw new TypeError('OpenAPI generation requires defineOpenAPI()')
  validateDocumentation(definition)
  const compiled = compileContract(definition.contract)
  const documentation = definition.documentation
  const version = documentation.openapi ?? '3.1.2'
  const docstrings =
    documentation.docstrings === undefined
      ? {}
      : await extractOpenAPIDocstrings(
          documentation.docstrings,
          compiled.routes.map(({ key }) => key)
        )
  const paths: Record<string, PathItemObject> = {}
  const operationIds = new Set<string>()

  for (const route of compiled.routes) {
    const value = routeDocumentation(definition, route.key)
    if (!record(value) || value['include'] === false) continue
    const operation = operationFor(definition, route, value as RuntimeRouteDocumentation, docstrings)
    if (operationIds.has(operation.operationId!)) {
      throw new Error(`Duplicate OpenAPI operationId "${operation.operationId}"`)
    }
    operationIds.add(operation.operationId!)
    const path = openAPIPath(route.path)
    const method = operationMethod(route.method, version)
    paths[path] = { ...paths[path], [method]: operation }
  }

  return {
    openapi: version,
    info: documentation.info,
    ...(documentation.servers === undefined ? {} : { servers: documentation.servers }),
    paths,
    ...(documentation.components === undefined ? {} : { components: documentation.components }),
    ...(documentation.security === undefined ? {} : { security: documentation.security }),
    ...(documentation.tags === undefined ? {} : { tags: documentation.tags }),
    ...(documentation.externalDocs === undefined ? {} : { externalDocs: documentation.externalDocs }),
    ...extensions(documentation),
  }
}
