import { isRecord } from '../object'
import { pathParamNames } from '../paths'
import { encodeQuery } from '../query'
import { encodeRequestBody, type AnyRequestBody, type TextWireObject } from '../request'
import type { Route } from '../route'
import { encodeSchema, type ObjectSchema } from '../validation'

export type ClientRequestOptions = {
  readonly headers?: HeadersInit
  readonly signal?: AbortSignal
}

export type ClientHeaders = HeadersInit | (() => HeadersInit | undefined | PromiseLike<HeadersInit | undefined>)

export type ClientTransportOptions = {
  /** URL prefix placed before the contract base path. Omit it to issue a relative request. */
  readonly baseUrl?: string | URL
  readonly fetch?: typeof fetch
  readonly headers?: ClientHeaders
}

export type ParameterDeclaration = {
  readonly names: readonly string[]
  readonly schema: ObjectSchema
}

export type CompiledClientRoute = {
  readonly method: string
  readonly parameters: readonly ParameterDeclaration[]
  readonly path: string
  readonly route: Route
}

export function compileParameterDeclaration(
  path: string,
  schema: ObjectSchema | undefined
): ParameterDeclaration | undefined {
  const names = pathParamNames(path)
  if (names.length === 0) return undefined
  if (schema === undefined) throw new TypeError(`Client route path "${path}" is missing a parameter schema`)
  return Object.freeze({ names: Object.freeze(names), schema })
}

function appendBaseUrl(baseUrl: string, path: string): string {
  const prefix = baseUrl.replace(/\/+$/, '')
  if (prefix === '') return path
  return path === '/' ? prefix || '/' : `${prefix}${path}`
}

export function assertClientBaseUrl(baseUrl: string | URL | undefined): void {
  if (baseUrl === undefined) return
  const value = String(baseUrl)
  if (value.includes('?')) throw new TypeError(`Client base URL "${value}" cannot contain a query string`)
  if (value.includes('#')) throw new TypeError(`Client base URL "${value}" cannot contain a hash fragment`)
}

function assignHeaders(target: Headers, source: HeadersInit | undefined): void {
  if (source === undefined) return
  new Headers(source).forEach((value, key) => target.set(key, value))
}

async function encodeParameters(
  path: string,
  declarations: readonly ParameterDeclaration[],
  value: Readonly<Record<string, unknown>>
): Promise<string> {
  const encodedValues: Record<string, string> = {}

  for (const declaration of declarations) {
    const input: Record<string, unknown> = {}
    for (const name of declaration.names) input[name] = value[name]

    const encoded = await encodeSchema(declaration.schema, input)
    if (!isRecord(encoded)) throw new TypeError('Encoded route parameters must be an object')

    for (const name of declaration.names) {
      const parameter = encoded[name]
      if (typeof parameter !== 'string') {
        throw new TypeError(`Route parameter "${name}" must encode to a string`)
      }
      encodedValues[name] = parameter
    }
  }

  return path
    .split('/')
    .map((segment) => (segment.startsWith(':') ? encodeURIComponent(encodedValues[segment.slice(1)] ?? '') : segment))
    .join('/')
}

function textWireObject(value: unknown, name: string): TextWireObject {
  if (!isRecord(value)) throw new TypeError(`Encoded ${name} must be an object`)

  for (const [key, field] of Object.entries(value)) {
    if (field !== undefined && typeof field !== 'string') {
      throw new TypeError(`Encoded ${name} field "${key}" must be a string or undefined`)
    }
  }

  return value as TextWireObject
}

function bodyInit(declaration: AnyRequestBody, value: unknown): BodyInit {
  switch (declaration.representation) {
    case 'json': {
      const encoded = JSON.stringify(value)
      if (encoded === undefined) throw new TypeError('JSON request body cannot encode to undefined')
      return encoded
    }
    case 'text':
      if (typeof value !== 'string') throw new TypeError('Text request body must encode to a string')
      return value
    case 'bytes':
      if (!(value instanceof Uint8Array)) throw new TypeError('Byte request body must encode to a Uint8Array')
      return value as BodyInit
    case 'form-data':
      if (!(value instanceof FormData)) throw new TypeError('Form data request body must encode to FormData')
      return value
  }
}

export async function createClientRequest(
  compiled: CompiledClientRoute,
  transport: ClientTransportOptions,
  input: Readonly<Record<string, unknown>>,
  options: ClientRequestOptions
): Promise<Request> {
  const route = compiled.route
  const path =
    compiled.parameters.length === 0
      ? compiled.path
      : await encodeParameters(compiled.path, compiled.parameters, input['params'] as Readonly<Record<string, unknown>>)
  const query = 'query' in route ? await encodeQuery(route.query, input['query'] as never) : undefined
  const queryString = query && query.size > 0 ? `?${query.toString()}` : ''
  const headers = new Headers()
  const resolvedConfiguredHeaders =
    typeof transport.headers === 'function' ? await transport.headers() : transport.headers
  assignHeaders(headers, resolvedConfiguredHeaders)
  assignHeaders(headers, options.headers)

  if ('headers' in route) {
    const encoded = textWireObject(await encodeSchema(route.headers, input['headers'] as never), 'headers')
    for (const [key, value] of Object.entries(encoded)) {
      if (value === undefined) headers.delete(key)
      else headers.set(key, value)
    }
  }

  let body: BodyInit | undefined
  if ('body' in route) {
    const encoded = await encodeRequestBody(route.body, input['body'] as never)
    body = bodyInit(route.body, encoded.body)
    if (route.body.representation === 'form-data') headers.delete('content-type')
    else headers.set('content-type', encoded.contentType)
  }

  const baseUrl = transport.baseUrl === undefined ? '' : String(transport.baseUrl)
  return new Request(`${appendBaseUrl(baseUrl, path)}${queryString}`, {
    method: compiled.method,
    headers,
    ...(body === undefined ? {} : { body }),
    ...(options.signal === undefined ? {} : { signal: options.signal }),
  })
}
