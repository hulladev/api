import type { CompiledContractRoute } from '../compiler'
import { encodePathParameters } from '../parameters'
import { encodeQuery } from '../query'
import { encodeRequestBodyValue, textWireObject, type AnyRequestBody } from '../request'
import { encodeSchemaValue, isSchemaStepAsync, mapSchemaStep, type SchemaStep } from '../validation'

export type ClientRequestOptions = {
  readonly headers?: HeadersInit
  readonly signal?: AbortSignal
}

export type ClientHeaders = HeadersInit | (() => HeadersInit | undefined | PromiseLike<HeadersInit | undefined>)

/** The exact transport surface used by the client after it constructs a Web Request. */
export type ClientFetch = (request: Request) => Response | PromiseLike<Response>

export type ClientTransportOptions = {
  /** URL prefix placed before the contract base path. Omit it to issue a relative request. */
  readonly baseUrl?: string | URL
  readonly fetch?: ClientFetch
  readonly headers?: ClientHeaders
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
  compiled: CompiledContractRoute,
  transport: ClientTransportOptions,
  input: Readonly<Record<string, unknown>>,
  options: ClientRequestOptions
): Promise<Request> {
  const route = compiled.route
  const hasHeaders = 'headers' in route
  const hasBody = 'body' in route
  const values = [
    compiled.pathParameters.length === 0
      ? compiled.path
      : encodePathParameters(
          compiled.path,
          compiled.pathParameters,
          input['params'] as Readonly<Record<string, unknown>>
        ),
    'query' in route ? encodeQuery(route.query, input['query'] as never) : undefined,
    typeof transport.headers === 'function' ? transport.headers() : transport.headers,
    hasHeaders
      ? mapSchemaStep(encodeSchemaValue(route.headers, input['headers'] as never, { location: 'headers' }), (encoded) =>
          textWireObject(encoded, 'headers')
        )
      : undefined,
    hasBody ? encodeRequestBodyValue(route.body, input['body'] as never) : undefined,
  ] as const satisfies readonly SchemaStep<unknown>[]
  type ResolvedValues = readonly [
    path: string,
    query: URLSearchParams | undefined,
    configuredHeaders: HeadersInit | undefined,
    routeHeaders: Readonly<Record<string, string | undefined>> | undefined,
    body: { readonly body: unknown; readonly contentType: string } | undefined,
  ]
  const [path, query, resolvedConfiguredHeaders, encodedRouteHeaders, encodedBody] = (
    values.some(isSchemaStepAsync) ? await Promise.all(values) : values
  ) as ResolvedValues
  const queryString = query && query.size > 0 ? `?${query.toString()}` : ''
  const headers = new Headers()
  assignHeaders(headers, resolvedConfiguredHeaders)
  assignHeaders(headers, options.headers)

  if (encodedRouteHeaders !== undefined) {
    for (const [key, value] of Object.entries(encodedRouteHeaders)) {
      if (value === undefined) headers.delete(key)
      else headers.set(key, value)
    }
  }

  let body: BodyInit | undefined
  if (hasBody && encodedBody !== undefined) {
    body = bodyInit(route.body, encodedBody.body)
    if (route.body.representation === 'form-data') headers.delete('content-type')
    else headers.set('content-type', encodedBody.contentType)
  }

  const baseUrl = transport.baseUrl === undefined ? '' : String(transport.baseUrl)
  return new Request(`${appendBaseUrl(baseUrl, path)}${queryString}`, {
    method: compiled.method,
    headers,
    ...(body === undefined ? {} : { body }),
    ...(options.signal === undefined ? {} : { signal: options.signal }),
  })
}
