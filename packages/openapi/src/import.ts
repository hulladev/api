import type {
  ExampleObject,
  HeaderObject,
  JSONSchema,
  MediaTypeObject,
  OpenAPIDiagnostic,
  OpenAPIDocument,
  OperationObject,
  ParameterObject,
  PathItemObject,
  ReferenceObject,
  RequestBodyObject,
  ResponseObject,
} from './types'

type HTTPMethod = 'get' | 'put' | 'post' | 'delete' | 'patch' | 'query'

export type OpenAPISchemaCodeContext = {
  readonly location: string
  readonly transport: 'json' | 'text'
}

export type OpenAPISchemaPropertyCode = {
  readonly name: string
  readonly schema: string
  readonly required: boolean
}

export type OpenAPISchemaCodeGenerator = {
  readonly imports: readonly string[]
  readonly requiresJsonValueType?: boolean
  readonly componentName: (name: string) => string
  readonly componentDeclaration: (name: string, schema: JSONSchema, recursive: boolean) => string
  readonly schema: (schema: JSONSchema | ReferenceObject | undefined, context: OpenAPISchemaCodeContext) => string
  readonly object: (properties: readonly OpenAPISchemaPropertyCode[], context: OpenAPISchemaCodeContext) => string
}

export type GenerateContractOptions = {
  readonly apiImport?: string
  readonly openapiImport?: string
  readonly contractImport?: string
  readonly schemaGenerator?: OpenAPISchemaCodeGenerator
}

export type GeneratedOpenAPIContract = {
  readonly contractCode: string
  readonly openapiCode: string
  readonly diagnostics: readonly OpenAPIDiagnostic[]
  readonly operations: readonly {
    readonly key: string
    readonly method: Uppercase<HTTPMethod>
    readonly path: string
  }[]
}

export class OpenAPIImportError extends Error {
  readonly diagnostics: readonly OpenAPIDiagnostic[]

  constructor(diagnostics: readonly OpenAPIDiagnostic[]) {
    super(diagnostics.map(({ location, message }) => `${location}: ${message}`).join('\n'))
    this.name = 'OpenAPIImportError'
    this.diagnostics = diagnostics
  }
}

type ImportContext = {
  readonly document: OpenAPIDocument
  readonly diagnostics: OpenAPIDiagnostic[]
  readonly schemaGenerator: OpenAPISchemaCodeGenerator
}

type CollectedOperation = {
  readonly key: string
  readonly method: HTTPMethod
  readonly path: string
  readonly pathItem: PathItemObject
  readonly operation: OperationObject
}

const methods: readonly HTTPMethod[] = ['get', 'put', 'post', 'delete', 'patch', 'query']

function quote(value: string): string {
  return JSON.stringify(value)
}

function propertyKey(value: string): string {
  return /^[A-Za-z_$][\w$]*$/.test(value) ? value : quote(value)
}

function words(value: string): string[] {
  const spaced = value
    .replace(/([a-z0-9])([A-Z])/g, '$1 $2')
    .replace(/[^A-Za-z0-9]+/g, ' ')
    .trim()
  return spaced.length === 0 ? [] : spaced.split(/\s+/)
}

function capitalize(value: string): string {
  return `${value.slice(0, 1).toUpperCase()}${value.slice(1).toLowerCase()}`
}

function camelCase(value: string): string {
  const [first = 'operation', ...rest] = words(value)
  return [first.toLowerCase(), ...rest.map(capitalize)].join('')
}

function pascalCase(value: string): string {
  return words(value).map(capitalize).join('') || 'Schema'
}

function componentName(name: string): string {
  return `${pascalCase(name)}Schema`
}

function isReference(value: unknown): value is ReferenceObject {
  return typeof value === 'object' && value !== null && '$ref' in value && typeof value.$ref === 'string'
}

function decodePointerPart(value: string): string {
  return value.replace(/~1/g, '/').replace(/~0/g, '~')
}

function resolvePointer(document: OpenAPIDocument, reference: string): unknown {
  if (!reference.startsWith('#/')) {
    throw new Error(`External reference "${reference}" must be bundled before @hulla/api generation`)
  }
  let current: unknown = document
  for (const encoded of reference.slice(2).split('/')) {
    const part = decodePointerPart(encoded)
    if (typeof current !== 'object' || current === null || !(part in current)) {
      throw new Error(`Reference "${reference}" could not be resolved`)
    }
    current = (current as Record<string, unknown>)[part]
  }
  return current
}

function resolveObject<Value extends object>(
  document: OpenAPIDocument,
  value: Value | ReferenceObject | undefined,
  location: string
): Value | undefined {
  if (value === undefined || !isReference(value)) return value as Value | undefined
  const seen = new Set<string>()
  let current: unknown = value
  while (isReference(current)) {
    if (seen.has(current.$ref)) throw new Error(`${location} contains a circular reference`)
    seen.add(current.$ref)
    current = resolvePointer(document, current.$ref)
  }
  if (typeof current !== 'object' || current === null || Array.isArray(current)) {
    throw new Error(`${location} reference must resolve to an object`)
  }
  return current as Value
}

function resolvedJSONSchema(
  document: OpenAPIDocument,
  schema: JSONSchema | ReferenceObject | undefined
): JSONSchema | undefined {
  let current = schema
  const seen = new Set<string>()
  while (isReference(current)) {
    if (seen.has(current.$ref)) return undefined
    seen.add(current.$ref)
    current = resolvePointer(document, current.$ref) as JSONSchema
  }
  return current
}

function isArraySchema(document: OpenAPIDocument, schema: JSONSchema | ReferenceObject | undefined): boolean {
  const resolved = resolvedJSONSchema(document, schema)
  return typeof resolved === 'object' && resolved !== null && resolved.type === 'array'
}

function diagnostic(
  context: ImportContext,
  severity: OpenAPIDiagnostic['severity'],
  location: string,
  message: string
): void {
  context.diagnostics.push({ severity, location, message })
}

function referenceComponentName(reference: ReferenceObject): string {
  const prefix = '#/components/schemas/'
  if (!reference.$ref.startsWith(prefix)) {
    throw new Error(`Schema reference "${reference.$ref}" must target #/components/schemas`)
  }
  return decodePointerPart(reference.$ref.slice(prefix.length))
}

function enumSchema(values: readonly unknown[], transport: 'json' | 'text'): string {
  if (values.length === 0) return 'z.never()'
  if (transport === 'text' && values.every((value) => typeof value !== 'object')) {
    const encoded = values.map((value) => String(value))
    const base = encoded.length === 1 ? `z.literal(${quote(encoded[0]!)})` : `z.enum(${JSON.stringify(encoded)})`
    if (values.every((value) => typeof value === 'string')) return base
    return `${base}.transform((value) => ${JSON.stringify(Object.fromEntries(encoded.map((key, index) => [key, values[index]])))}[value]!)`
  }
  if (values.length === 1) return `z.literal(${JSON.stringify(values[0])})`
  if (values.every((value) => typeof value === 'string')) return `z.enum(${JSON.stringify(values)})`
  return `z.union([${values.map((value) => `z.literal(${JSON.stringify(value)})`).join(', ')}])`
}

function stringSchema(schema: Exclude<JSONSchema, boolean>): string {
  let result = 'z.string()'
  if (schema.format === 'date-time') result += '.datetime()'
  else if (schema.format === 'email') result += '.email()'
  else if (schema.format === 'uri' || schema.format === 'url') result += '.url()'
  else if (schema.format === 'uuid') result += '.uuid()'
  const minLength = schema['minLength']
  const maxLength = schema['maxLength']
  const pattern = schema['pattern']
  if (typeof minLength === 'number') result += `.min(${minLength})`
  if (typeof maxLength === 'number') result += `.max(${maxLength})`
  if (typeof pattern === 'string') result += `.regex(new RegExp(${quote(pattern)}))`
  return result
}

function numberConstraints(schema: Exclude<JSONSchema, boolean>, base: string): string {
  let result = base
  const minimum = schema['minimum']
  const maximum = schema['maximum']
  const exclusiveMinimum = schema['exclusiveMinimum']
  const exclusiveMaximum = schema['exclusiveMaximum']
  if (typeof minimum === 'number') result += `.min(${minimum})`
  if (typeof maximum === 'number') result += `.max(${maximum})`
  if (typeof exclusiveMinimum === 'number') result += `.gt(${exclusiveMinimum})`
  if (typeof exclusiveMaximum === 'number') result += `.lt(${exclusiveMaximum})`
  return result
}

function zodSchema(schema: JSONSchema | ReferenceObject | undefined, context: OpenAPISchemaCodeContext): string {
  if (schema === undefined || schema === true) return context.transport === 'json' ? 'z.json()' : 'z.string()'
  if (schema === false) return 'z.never()'
  if (isReference(schema)) return componentName(referenceComponentName(schema))

  if (schema.const !== undefined) return enumSchema([schema.const], context.transport)
  if (schema.enum !== undefined) return enumSchema(schema.enum, context.transport)

  const allOf = schema['allOf']
  if (Array.isArray(allOf) && allOf.length > 0) {
    return allOf
      .map((part) => zodSchema(part as JSONSchema | ReferenceObject, context))
      .reduce((left, right) => `z.intersection(${left}, ${right})`)
  }
  const union = (Array.isArray(schema['oneOf']) ? schema['oneOf'] : schema['anyOf']) as
    | readonly (JSONSchema | ReferenceObject)[]
    | undefined
  if (union !== undefined && union.length > 0) {
    if (union.length === 1) return zodSchema(union[0], context)
    return `z.union([${union.map((part) => zodSchema(part, context)).join(', ')}])`
  }

  const types = Array.isArray(schema.type) ? schema.type : schema.type === undefined ? [] : [schema.type]
  const nullable = types.includes('null') || schema['nullable'] === true
  const nonNull = types.filter((type) => type !== 'null')
  if (nonNull.length > 1) {
    const base = `z.union([${nonNull.map((type) => zodSchema({ ...schema, type }, context)).join(', ')}])`
    return nullable ? `${base}.nullable()` : base
  }

  const type = nonNull[0]
  let result: string
  if (context.transport === 'text') {
    if (type === 'number' || type === 'integer') {
      result = numberConstraints(schema, `z.coerce.number<string>()${type === 'integer' ? '.int()' : ''}`)
    } else if (type === 'boolean') {
      result = "z.enum(['true', 'false']).transform((value) => value === 'true')"
    } else if (type === 'array') {
      const item = zodSchema(schema.items, context)
      result = `z.union([${item}, z.array(${item})]).transform((value) => Array.isArray(value) ? value : [value])`
    } else result = stringSchema(schema)
  } else {
    switch (type) {
      case 'array':
        result = `z.array(${zodSchema(schema.items, context)})`
        break
      case 'boolean':
        result = 'z.boolean()'
        break
      case 'integer':
        result = numberConstraints(schema, 'z.number().int()')
        break
      case 'number':
        result = numberConstraints(schema, 'z.number()')
        break
      case 'null':
        result = 'z.null()'
        break
      case 'object':
        result = zodObjectSchema(schema, context)
        break
      case 'string':
        result = stringSchema(schema)
        break
      default:
        result =
          schema.properties !== undefined || schema['additionalProperties'] !== undefined
            ? zodObjectSchema(schema, context)
            : 'z.json()'
    }
  }
  return nullable && type !== 'null' ? `${result}.nullable()` : result
}

function zodObjectSchema(schema: Exclude<JSONSchema, boolean>, context: OpenAPISchemaCodeContext): string {
  const properties = Object.entries(schema.properties ?? {})
  const required = new Set(schema.required ?? [])
  if (properties.length === 0 && typeof schema['additionalProperties'] === 'object') {
    return `z.record(z.string(), ${zodSchema(schema['additionalProperties'] as JSONSchema, context)})`
  }
  const lines = ['z.object({']
  for (const [name, property] of properties) {
    const expression = zodSchema(property, context)
    lines.push(`  ${propertyKey(name)}: ${required.has(name) ? expression : `${expression}.optional()`},`)
  }
  lines.push('})')
  let result = lines.join('\n')
  if (schema['additionalProperties'] === false) result += '.strict()'
  else if (typeof schema['additionalProperties'] === 'object') {
    result += `.catchall(${zodSchema(schema['additionalProperties'] as JSONSchema, context)})`
  }
  return result
}

export function zodSchemaCodeGenerator(options: { readonly import?: string } = {}): OpenAPISchemaCodeGenerator {
  return {
    imports: [`import { z } from ${quote(options.import ?? 'zod')}`],
    requiresJsonValueType: true,
    componentName,
    componentDeclaration(name, schema, recursive) {
      const declaration = zodSchema(schema, { location: `components.schemas.${name}`, transport: 'json' })
      return recursive
        ? `const ${componentName(name)}: z.ZodType<JsonValue> = z.lazy(() => ${declaration})`
        : `const ${componentName(name)} = ${declaration}`
    },
    schema: zodSchema,
    object(properties) {
      const lines = ['z.object({']
      for (const property of properties) {
        lines.push(
          `  ${propertyKey(property.name)}: ${property.required ? property.schema : `${property.schema}.optional()`},`
        )
      }
      lines.push('})')
      return lines.join('\n')
    },
  }
}

function schemaReferences(schema: unknown, references = new Set<string>(), seen = new WeakSet<object>()): Set<string> {
  if (typeof schema !== 'object' || schema === null || seen.has(schema)) return references
  seen.add(schema)
  if (isReference(schema)) {
    const prefix = '#/components/schemas/'
    if (schema.$ref.startsWith(prefix)) references.add(decodePointerPart(schema.$ref.slice(prefix.length)))
    return references
  }
  for (const value of Object.values(schema)) schemaReferences(value, references, seen)
  return references
}

function orderedComponents(schemas: Readonly<Record<string, JSONSchema>>): readonly {
  readonly name: string
  readonly schema: JSONSchema
  readonly recursive: boolean
}[] {
  const ordered: string[] = []
  const state = new Map<string, 'visiting' | 'visited'>()
  const stack: string[] = []
  const recursive = new Set<string>()
  const visit = (name: string): void => {
    if (state.get(name) === 'visited') return
    if (state.get(name) === 'visiting') {
      const start = stack.lastIndexOf(name)
      for (const member of stack.slice(start)) recursive.add(member)
      return
    }
    state.set(name, 'visiting')
    stack.push(name)
    for (const dependency of schemaReferences(schemas[name])) if (dependency in schemas) visit(dependency)
    stack.pop()
    state.set(name, 'visited')
    ordered.push(name)
  }
  for (const name of Object.keys(schemas)) visit(name)
  return ordered.map((name) => ({ name, schema: schemas[name]!, recursive: recursive.has(name) }))
}

function operationKey(method: HTTPMethod, path: string, operation: OperationObject): string {
  return camelCase(operation.operationId ?? [method, ...path.split('/')].join(' '))
}

function collectOperations(document: OpenAPIDocument): CollectedOperation[] {
  const used = new Set<string>()
  const result: CollectedOperation[] = []
  for (const [path, pathItem] of Object.entries(document.paths)) {
    for (const method of methods) {
      const operation = pathItem[method]
      if (operation === undefined) continue
      const base = operationKey(method, path, operation)
      let key = base
      let suffix = 2
      while (used.has(key)) key = `${base}${suffix++}`
      used.add(key)
      result.push({ key, method, path, pathItem, operation })
    }
  }
  return result
}

function mergedParameters(context: ImportContext, model: CollectedOperation): ParameterObject[] {
  const parameters = [...(model.pathItem.parameters ?? []), ...(model.operation.parameters ?? [])]
  const merged = new Map<string, ParameterObject>()
  for (const parameter of parameters) {
    try {
      const resolved = resolveObject<ParameterObject>(
        context.document,
        parameter,
        `${model.method} ${model.path} parameter`
      )
      if (resolved !== undefined) merged.set(`${resolved.in}:${resolved.name}`, resolved)
    } catch (error) {
      diagnostic(context, 'error', `${model.method.toUpperCase()} ${model.path}`, String(error))
    }
  }
  return [...merged.values()]
}

function parameterSchema(
  context: ImportContext,
  parameters: readonly ParameterObject[],
  location: ParameterObject['in'],
  owner: string
): string | undefined {
  const selected = parameters.filter((parameter) => parameter.in === location)
  if (selected.length === 0) return undefined
  const properties: OpenAPISchemaPropertyCode[] = []
  for (const parameter of selected) {
    const parameterOwner = `${owner} parameter ${parameter.name}`
    if (parameter.content !== undefined) {
      diagnostic(context, 'error', parameterOwner, 'content-based parameter serialization is not supported')
      continue
    }
    if (location === 'cookie') {
      diagnostic(context, 'error', parameterOwner, 'cookie parameters are not supported by @hulla/api routes')
      continue
    }
    if (location === 'path' && parameter.required !== true) {
      diagnostic(
        context,
        'warning',
        parameterOwner,
        'path parameters are always required; generated contract makes it required'
      )
    }
    if (location === 'query' && parameter.style !== undefined && parameter.style !== 'form') {
      diagnostic(context, 'error', parameterOwner, `query style "${parameter.style}" is not supported`)
    }
    if (location === 'query' && parameter.explode === false) {
      diagnostic(context, 'error', parameterOwner, 'explode: false query serialization is not supported')
    }
    if (parameter.allowReserved === true) {
      diagnostic(context, 'error', parameterOwner, 'allowReserved query serialization is not supported')
    }
    if (location !== 'query' && parameter.style !== undefined && parameter.style !== 'simple') {
      diagnostic(context, 'error', parameterOwner, `${location} style "${parameter.style}" is not supported`)
    }
    if (location !== 'query' && isArraySchema(context.document, parameter.schema)) {
      diagnostic(context, 'error', parameterOwner, `${location} parameters cannot use array wire values`)
    }
    const expression = context.schemaGenerator.schema(parameter.schema, {
      location: parameterOwner,
      transport: 'text',
    })
    const required = location === 'path' || parameter.required === true
    properties.push({ name: parameter.name, schema: expression, required })
  }
  return context.schemaGenerator.object(properties, { location: owner, transport: 'text' })
}

function mediaEntries(content: Readonly<Record<string, MediaTypeObject>>): readonly [string, MediaTypeObject][] {
  return Object.entries(content).map(([type, media]) => [type.toLowerCase(), media])
}

function isJSON(type: string): boolean {
  const essence = type.split(';', 1)[0]!.trim()
  return essence === 'application/json' || (essence.startsWith('application/') && essence.endsWith('+json'))
}

function selectedMedia(
  context: ImportContext,
  content: Readonly<Record<string, MediaTypeObject>>,
  owner: string
): readonly [string, MediaTypeObject] | undefined {
  const entries = mediaEntries(content)
  const selected =
    entries.find(([type]) => isJSON(type)) ??
    entries.find(([type]) => type.startsWith('text/')) ??
    entries.find(([type]) => type === 'application/octet-stream') ??
    entries.find(([type]) => type === 'multipart/form-data') ??
    entries[0]
  if (entries.length > 1 && selected !== undefined) {
    diagnostic(
      context,
      'warning',
      owner,
      `multiple media types cannot be represented by one @hulla/api route; selected ${selected[0]}`
    )
  }
  return selected
}

function requestBodyCode(context: ImportContext, model: CollectedOperation, owner: string): string | undefined {
  let body: RequestBodyObject | undefined
  try {
    body = resolveObject<RequestBodyObject>(context.document, model.operation.requestBody, `${owner} request body`)
  } catch (error) {
    diagnostic(context, 'error', owner, String(error))
    return undefined
  }
  if (body === undefined) return undefined
  if (model.method === 'get') {
    diagnostic(context, 'error', owner, '@hulla/api GET routes do not accept request bodies')
    return undefined
  }
  if (body.required !== true) {
    diagnostic(context, 'warning', owner, '@hulla/api route bodies are structurally required when declared')
  }
  const media = selectedMedia(context, body.content, `${owner} request body`)
  if (media === undefined) return undefined
  const [contentType, value] = media
  if (isJSON(contentType)) {
    return `request.json(${context.schemaGenerator.schema(value.schema, { location: `${owner} request body`, transport: 'json' })}, { contentType: ${quote(contentType)} })`
  }
  if (contentType.startsWith('text/')) {
    return `request.text(${context.schemaGenerator.schema(value.schema ?? { type: 'string' }, { location: `${owner} request body`, transport: 'json' })}, { contentType: ${quote(contentType)} })`
  }
  if (contentType === 'application/octet-stream') return `request.bytes({ contentType: ${quote(contentType)} })`
  if (contentType === 'multipart/form-data') {
    diagnostic(
      context,
      'warning',
      owner,
      'multipart field schemas are retained in the OpenAPI sidecar but not in FormData runtime types'
    )
    return `request.formData({ contentType: ${quote(contentType)} })`
  }
  diagnostic(context, 'error', owner, `request media type ${contentType} is not supported`)
  return undefined
}

function responseCode(context: ImportContext, response: ResponseObject, owner: string): string {
  const headerEntries = Object.entries(response.headers ?? {})
  let headers = ''
  if (headerEntries.length > 0) {
    const fields = headerEntries.map(([name, header]): OpenAPISchemaPropertyCode => {
      const resolved = resolveObject<HeaderObject>(context.document, header, `${owner} header ${name}`)
      if (isArraySchema(context.document, resolved?.schema)) {
        diagnostic(context, 'error', `${owner} header ${name}`, 'response headers cannot use array wire values')
      }
      const expression = context.schemaGenerator.schema(resolved?.schema, {
        location: `${owner} header ${name}`,
        transport: 'text',
      })
      return { name, schema: expression, required: resolved?.required === true }
    })
    headers = context.schemaGenerator.object(fields, { location: `${owner} headers`, transport: 'text' })
  }
  const options = (contentType?: string): string => {
    const fields = [
      ...(headers === '' ? [] : [`headers: ${headers}`]),
      ...(contentType === undefined ? [] : [`contentType: ${quote(contentType)}`]),
    ]
    return fields.length === 0 ? '' : `{ ${fields.join(', ')} }`
  }
  if (response.content === undefined || Object.keys(response.content).length === 0) {
    return `response.empty(${options()})`
  }
  const media = selectedMedia(context, response.content, owner)
  if (media === undefined) return `response.empty(${options()})`
  const [contentType, value] = media
  if (isJSON(contentType)) {
    const schema = context.schemaGenerator.schema(value.schema, { location: owner, transport: 'json' })
    return `response.json(${schema}, ${options(contentType) || '{}'})`
  }
  if (contentType.startsWith('text/')) {
    const schema = context.schemaGenerator.schema(value.schema ?? { type: 'string' }, {
      location: owner,
      transport: 'json',
    })
    return `response.text(${schema}, ${options(contentType) || '{}'})`
  }
  if (contentType === 'application/octet-stream') return `response.bytes(${options(contentType)})`
  diagnostic(context, 'error', owner, `response media type ${contentType} is not supported`)
  return `response.empty(${options()})`
}

function responsesCode(context: ImportContext, model: CollectedOperation, owner: string): string {
  const lines = ['{']
  for (const [status, value] of Object.entries(model.operation.responses)) {
    if (!/^\d{3}$/.test(status)) {
      diagnostic(
        context,
        'error',
        `${owner} response ${status}`,
        'response ranges and default responses are not supported'
      )
      continue
    }
    let response: ResponseObject | undefined
    try {
      response = resolveObject<ResponseObject>(context.document, value, `${owner} response ${status}`)
    } catch (error) {
      diagnostic(context, 'error', `${owner} response ${status}`, String(error))
    }
    if (response !== undefined)
      lines.push(`  ${status}: ${responseCode(context, response, `${owner} response ${status}`)},`)
  }
  lines.push('}')
  return lines.join('\n')
}

function hullaPath(path: string): string {
  return path.replace(/\{([^}/]+)\}/g, ':$1')
}

function routeCode(context: ImportContext, model: CollectedOperation): string {
  const owner = `${model.method.toUpperCase()} ${model.path}`
  const rawOperation = model.operation as OperationObject & Readonly<Record<string, unknown>>
  if (rawOperation['callbacks'] !== undefined) {
    diagnostic(context, 'error', owner, 'callbacks cannot be represented by an @hulla/api route contract')
  }
  if (rawOperation['servers'] !== undefined) {
    diagnostic(context, 'warning', owner, 'operation-specific servers are not retained in the generated contract')
  }
  const parameters = mergedParameters(context, model)
  const pathNames = [...model.path.matchAll(/\{([^}/]+)\}/g)].map((match) => match[1]!)
  const declaredPathNames = parameters.filter((parameter) => parameter.in === 'path').map(({ name }) => name)
  for (const name of pathNames) {
    if (!declaredPathNames.includes(name))
      diagnostic(context, 'error', owner, `path parameter "${name}" is not declared`)
  }
  for (const name of declaredPathNames) {
    if (!pathNames.includes(name))
      diagnostic(context, 'error', owner, `declared path parameter "${name}" is not in the path`)
  }
  const params = parameterSchema(context, parameters, 'path', owner)
  const query = parameterSchema(context, parameters, 'query', owner)
  const headers = parameterSchema(context, parameters, 'header', owner)
  parameterSchema(context, parameters, 'cookie', owner)
  const body = requestBodyCode(context, model, owner)
  const options = [
    ...(params === undefined ? [] : [`params: ${params}`]),
    ...(query === undefined ? [] : [`query: ${query}`]),
    ...(headers === undefined ? [] : [`headers: ${headers}`]),
    ...(body === undefined ? [] : [`body: ${body}`]),
    `responses: ${responsesCode(context, model, owner)}`,
  ]
  return `route.${model.method}(${quote(hullaPath(model.path))}, {\n${options.map((line) => `  ${line},`).join('\n')}\n})`
}

function examplesDocumentation(
  media: MediaTypeObject | undefined
): Readonly<Record<string, ExampleObject>> | undefined {
  if (media === undefined) return undefined
  if (media.examples !== undefined) {
    const entries = Object.entries(media.examples).filter(
      (entry): entry is [string, ExampleObject] => !isReference(entry[1])
    )
    return entries.length === 0 ? undefined : Object.fromEntries(entries)
  }
  return media.example === undefined ? undefined : { default: { value: media.example } }
}

function requestDocumentation(context: ImportContext, model: CollectedOperation): Record<string, unknown> | undefined {
  const parameters = mergedParameters(context, model)
  const result: Record<string, unknown> = {}
  for (const [source, target] of [
    ['path', 'path'],
    ['query', 'query'],
    ['header', 'headers'],
  ] as const) {
    const entries = parameters
      .filter((parameter) => parameter.in === source && parameter.description !== undefined)
      .map((parameter) => [parameter.name, { description: parameter.description }])
    if (entries.length > 0) result[target] = Object.fromEntries(entries)
  }
  const body = resolveObject<RequestBodyObject>(
    context.document,
    model.operation.requestBody,
    `${model.method} ${model.path}`
  )
  if (body !== undefined) {
    const media = selectedMedia(context, body.content, `${model.method} ${model.path} request documentation`)
    result['body'] = {
      ...(body.description === undefined ? {} : { description: body.description }),
      required: true,
      ...(examplesDocumentation(media?.[1]) === undefined ? {} : { examples: examplesDocumentation(media?.[1]) }),
    }
  }
  return Object.keys(result).length === 0 ? undefined : result
}

function routeDocumentationCode(context: ImportContext, model: CollectedOperation): string {
  const operation = model.operation
  const request = requestDocumentation(context, model)
  const responses: Record<string, unknown> = {}
  for (const [status, value] of Object.entries(operation.responses)) {
    if (!/^\d{3}$/.test(status)) continue
    const response = resolveObject<ResponseObject>(
      context.document,
      value,
      `${model.method} ${model.path} response ${status}`
    )
    if (response === undefined) continue
    const media =
      response.content === undefined
        ? undefined
        : selectedMedia(context, response.content, `${model.method} ${model.path}`)
    responses[status] = {
      description: response.description,
      ...(examplesDocumentation(media?.[1]) === undefined ? {} : { examples: examplesDocumentation(media?.[1]) }),
    }
  }
  const value = {
    ...(operation.operationId === undefined ? {} : { operationId: operation.operationId }),
    ...(operation.summary === undefined ? {} : { summary: operation.summary }),
    ...(operation.description === undefined ? {} : { description: operation.description }),
    ...(operation.tags === undefined ? {} : { tags: operation.tags }),
    ...(operation.deprecated === undefined ? {} : { deprecated: operation.deprecated }),
    ...(operation.externalDocs === undefined ? {} : { externalDocs: operation.externalDocs }),
    ...(operation.security === undefined ? {} : { security: operation.security }),
    ...(request === undefined ? {} : { request }),
    responses,
  }
  return JSON.stringify(value, null, 2)
}

/** Generates an @hulla/api runtime contract and a separate typed `.openapi.ts` sidecar. */
export function generateContractFromOpenAPI(
  document: OpenAPIDocument,
  options: GenerateContractOptions = {}
): GeneratedOpenAPIContract {
  const diagnostics: OpenAPIDiagnostic[] = []
  const schemaGenerator = options.schemaGenerator ?? zodSchemaCodeGenerator()
  const context: ImportContext = { document, diagnostics, schemaGenerator }
  if (document.openapi.startsWith('3.0')) {
    diagnostic(
      context,
      'warning',
      'openapi',
      'OpenAPI 3.0 schema keywords are converted to the OpenAPI 3.1 sidecar where possible'
    )
  }
  const rawDocument = document as OpenAPIDocument & Readonly<Record<string, unknown>>
  if (rawDocument['webhooks'] !== undefined) {
    diagnostic(context, 'warning', 'webhooks', 'webhooks are not part of the generated @hulla/api runtime contract')
  }
  for (const [path, pathItem] of Object.entries(document.paths)) {
    const rawPathItem = pathItem as PathItemObject & Readonly<Record<string, unknown>>
    for (const method of ['head', 'options', 'trace'] as const) {
      if (rawPathItem[method] !== undefined) {
        diagnostic(
          context,
          'error',
          `${method.toUpperCase()} ${path}`,
          `HTTP ${method.toUpperCase()} is not supported by @hulla/api route declarations`
        )
      }
    }
  }
  const operations = collectOperations(document)
  const components = orderedComponents(document.components?.schemas ?? {})
  const apiImport = options.apiImport ?? '@hulla/api'
  const componentLines = components.map(({ name, schema, recursive }) =>
    schemaGenerator.componentDeclaration(name, schema, recursive)
  )
  const routeLines = operations.map(
    (operation) => `    ${propertyKey(operation.key)}: ${routeCode(context, operation)},`
  )
  const usesRequest = operations.some(({ operation }) => operation.requestBody !== undefined)
  const usesJsonValue = schemaGenerator.requiresJsonValueType === true && components.some(({ recursive }) => recursive)
  const usesGeneratedSchemas = [...componentLines, ...routeLines].some((line) => line.includes('z.'))
  const apiImports = ['defineContract', ...(usesRequest ? ['request'] : []), 'response', 'route']
  const contractCode = [
    `import { ${apiImports.join(', ')}${usesJsonValue ? ', type JsonValue' : ''} } from ${quote(apiImport)}`,
    ...(usesGeneratedSchemas ? schemaGenerator.imports : []),
    '',
    ...componentLines.flatMap((line) => [line, '']),
    'export const contract = defineContract({',
    '  routes: {',
    ...routeLines,
    '  },',
    '})',
    '',
  ].join('\n')

  if (diagnostics.some(({ severity }) => severity === 'error')) throw new OpenAPIImportError(diagnostics)

  const contractImport = options.contractImport ?? './api.generated'
  const openapiImport = options.openapiImport ?? '@hulla/api-openapi'
  const sidecarRoutes = operations.map((operation) => {
    const documentation = routeDocumentationCode(context, operation)
    return `    ${propertyKey(operation.key)}: ${documentation.replace(/\n/g, '\n    ')},`
  })
  const documentation = {
    openapi: document.openapi === '3.2.0' ? '3.2.0' : '3.1.2',
    info: document.info,
    ...(document.servers === undefined ? {} : { servers: document.servers }),
    ...(document.tags === undefined ? {} : { tags: document.tags }),
    ...(document.security === undefined ? {} : { security: document.security }),
    ...(document.externalDocs === undefined ? {} : { externalDocs: document.externalDocs }),
    ...(document.components === undefined ? {} : { components: document.components }),
  }
  const serialized = JSON.stringify(documentation, null, 2)
  const documentationLines = serialized
    .slice(1, -1)
    .trim()
    .split('\n')
    .map((line) => (line.startsWith('  ') ? line.slice(2) : line))
  const openapiCode = [
    `import { defineOpenAPI } from ${quote(openapiImport)}`,
    `import { contract } from ${quote(contractImport)}`,
    '',
    'export default defineOpenAPI(contract, {',
    ...documentationLines.map((line, index) => `  ${line}${index === documentationLines.length - 1 ? ',' : ''}`),
    '  routes: {',
    ...sidecarRoutes,
    '  },',
    '})',
    '',
  ].join('\n')

  return {
    contractCode,
    openapiCode,
    diagnostics,
    operations: operations.map(({ key, method, path }) => ({
      key,
      method: method.toUpperCase() as Uppercase<HTTPMethod>,
      path,
    })),
  }
}
