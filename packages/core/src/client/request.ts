import { type ExecutionStep, isPromiseLike, mapExecutionStep } from '../execution'
import { textWireObject } from '../request'
import type { CanonicalRoutePlan } from '../route-plan'

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

export type ClientRequestCreator = (
  input: Readonly<Record<string, unknown>>,
  options: ClientRequestOptions
) => ExecutionStep<Request>

function normalizedBaseUrl(baseUrl: string | URL | undefined): string {
  const prefix = baseUrl === undefined ? '' : String(baseUrl).replace(/\/+$/, '')
  return prefix
}

function appendBaseUrl(prefix: string, path: string): string {
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

type CompiledBody = {
  readonly body: BodyInit
  readonly contentType: string | null
}

function compileBodySerializer(representation: string, contentType: string): (value: unknown) => CompiledBody {
  switch (representation) {
    case 'json': {
      return (value) => {
        const encoded = JSON.stringify(value)
        if (encoded === undefined) throw new TypeError('JSON request body cannot encode to undefined')
        return { body: encoded, contentType }
      }
    }
    case 'text':
      return (value) => {
        if (typeof value !== 'string') throw new TypeError('Text request body must encode to a string')
        return { body: value, contentType }
      }
    case 'bytes':
      return (value) => {
        if (!(value instanceof Uint8Array)) throw new TypeError('Byte request body must encode to a Uint8Array')
        return { body: value as BodyInit, contentType }
      }
    case 'form-data':
      return (value) => {
        if (!(value instanceof FormData)) throw new TypeError('Form data request body must encode to FormData')
        return { body: value, contentType: null }
      }
    default:
      throw new TypeError(`Unsupported request body representation "${representation}"`)
  }
}

function mergedHeaders(
  configured: HeadersInit | undefined,
  options: HeadersInit | undefined,
  routeHeaders: Readonly<Record<string, string | undefined>> | undefined,
  contentType: string | null | undefined
): HeadersInit | undefined {
  if (configured === undefined && options === undefined && routeHeaders === undefined) {
    return contentType === undefined || contentType === null ? undefined : { 'content-type': contentType }
  }

  const headers = new Headers()
  assignHeaders(headers, configured)
  assignHeaders(headers, options)
  if (routeHeaders !== undefined) {
    for (const [key, value] of Object.entries(routeHeaders)) {
      if (value === undefined) headers.delete(key)
      else headers.set(key, value)
    }
  }
  if (contentType === null) headers.delete('content-type')
  else if (contentType !== undefined) headers.set('content-type', contentType)
  return headers
}

function requestValue(
  url: string,
  method: string,
  options: ClientRequestOptions,
  headers: HeadersInit | undefined,
  body: BodyInit | undefined
): Request {
  const signal = options.signal
  if (method === 'GET' && headers === undefined && body === undefined && signal === undefined) {
    return new Request(url)
  }

  const init: RequestInit = { method }
  if (headers !== undefined) init.headers = headers
  if (body !== undefined) init.body = body
  if (signal !== undefined) init.signal = signal
  return new Request(url, init)
}

export function compileClientRequest(
  plan: CanonicalRoutePlan,
  transport: ClientTransportOptions
): ClientRequestCreator {
  const compiled = plan.compiled
  const baseUrl = normalizedBaseUrl(transport.baseUrl)
  const staticUrl = compiled.pathParameters.length === 0 ? appendBaseUrl(baseUrl, compiled.path) : undefined
  const encodePath = plan.encodePath
  const encodeQuery = plan.encodeQuery
  const encodeHeaders = plan.headers?.encode
  const encodeBody = plan.body?.schema.encode
  const serializeBody =
    plan.body === undefined
      ? undefined
      : compileBodySerializer(plan.body.declaration.representation, plan.body.declaration.contentType)
  const configuredHeaders = transport.headers

  if (staticUrl !== undefined && encodeQuery === undefined && encodeHeaders === undefined && encodeBody !== undefined) {
    return (input, options) =>
      mapExecutionStep(encodeBody(input['body'] as never), (encoded) => {
        const serialized = serializeBody!(encoded)
        const configured = typeof configuredHeaders === 'function' ? configuredHeaders() : configuredHeaders
        return mapExecutionStep(configured, (resolvedHeaders) =>
          requestValue(
            staticUrl,
            compiled.method,
            options,
            mergedHeaders(resolvedHeaders, options.headers, undefined, serialized.contentType),
            serialized.body
          )
        )
      })
  }

  if (
    staticUrl !== undefined &&
    encodeQuery === undefined &&
    encodeHeaders === undefined &&
    encodeBody === undefined &&
    configuredHeaders === undefined
  ) {
    return (_input, options) => requestValue(staticUrl, compiled.method, options, options.headers, undefined)
  }

  return (input, options) => {
    const values = [
      staticUrl ?? encodePath!(input['params'] as Readonly<Record<string, unknown>>),
      encodeQuery?.(input['query'] as never),
      typeof configuredHeaders === 'function' ? configuredHeaders() : configuredHeaders,
      encodeHeaders === undefined
        ? undefined
        : mapExecutionStep(encodeHeaders(input['headers'] as never), (encoded) => textWireObject(encoded, 'headers')),
      encodeBody === undefined
        ? undefined
        : mapExecutionStep(encodeBody(input['body'] as never), (encoded) => serializeBody!(encoded)),
    ] as const
    type ResolvedValues = readonly [
      path: string,
      query: URLSearchParams | undefined,
      configuredHeaders: HeadersInit | undefined,
      routeHeaders: Readonly<Record<string, string | undefined>> | undefined,
      body: CompiledBody | undefined,
    ]
    const resolved = values.some(isPromiseLike) ? Promise.all(values) : values
    return mapExecutionStep(resolved as ExecutionStep<ResolvedValues>, (parts) => {
      const [path, query, resolvedConfiguredHeaders, encodedRouteHeaders, encodedBody] = parts
      const queryString = query && query.size > 0 ? `?${query.toString()}` : ''
      return requestValue(
        `${staticUrl ?? appendBaseUrl(baseUrl, path)}${queryString}`,
        compiled.method,
        options,
        mergedHeaders(resolvedConfiguredHeaders, options.headers, encodedRouteHeaders, encodedBody?.contentType),
        encodedBody?.body
      )
    })
  }
}
