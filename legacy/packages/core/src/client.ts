import {
  decodeHTTPValue,
  encodeHTTPValue,
  hullaAPIErrorCodes,
  hullaRequestIdHeader,
  protocolHeaders,
  type HullaAPIErrorBody,
  type HullaAPIErrorCode,
} from './codec'
import type { HTTPRoute, HTTPRouteContract, HTTPWireType, Schema } from './types.public'
import { objectHTTPWire } from './wire'
import { encodeHTTPBodyValue, encodeHTTPURLValue, isPlainObject } from './wire-codec'

export type ClientRequestOptions = {
  readonly signal?: AbortSignal
  readonly headers?: HeadersInit
}

export type ClientHeaders = HeadersInit | (() => HeadersInit | PromiseLike<HeadersInit | undefined> | undefined)

export type HttpTransportOptions = {
  readonly baseUrl?: string
  readonly fetch?: typeof fetch
  readonly headers?: ClientHeaders
}

export type HttpTransport = {
  call<Output = unknown>(route: HTTPRoute | HTTPRouteContract, ...args: unknown[]): Promise<Output>
  request<Output = unknown>(
    route: HTTPRoute | HTTPRouteContract,
    options: ClientRequestOptions,
    ...args: unknown[]
  ): Promise<Output>
}

export type { HullaAPIErrorBody, HullaAPIErrorCode } from './codec'

export class HullaAPIError<Code extends string = string, Body = unknown> extends Error {
  readonly response: Response
  readonly status: number
  readonly requestId?: string
  readonly code: Code
  readonly body: Body

  constructor(response: Response, options: { readonly code: Code; readonly body: Body; readonly message?: string }) {
    super(options.message ?? `Hulla API request failed with ${response.status} ${response.statusText}`)
    this.name = 'HullaAPIError'
    this.response = response
    this.status = response.status
    this.requestId = response.headers.get(hullaRequestIdHeader) ?? undefined
    this.code = options.code
    this.body = options.body
  }
}

export function isHullaAPIError(error: unknown): error is HullaAPIError
export function isHullaAPIError<const Code extends string>(
  error: unknown,
  code: Code
): error is HullaAPIError<Code, HullaAPIErrorBody<Code>>
export function isHullaAPIError(error: unknown, code?: string): error is HullaAPIError {
  return error instanceof HullaAPIError && (code === undefined || error.code === code)
}

type Callable = (...args: never[]) => unknown

export type ClientProcedure<Procedure extends Callable> = Procedure & {
  request(options: ClientRequestOptions, ...args: Parameters<Procedure>): ReturnType<Procedure>
}

/** Adds request-scoped transport options to a generated client procedure. */
export function clientProcedure<const Procedure extends Callable>(
  procedure: Procedure,
  request: (options: ClientRequestOptions, ...args: Parameters<Procedure>) => ReturnType<Procedure>
): ClientProcedure<Procedure> {
  Object.defineProperty(procedure, 'request', {
    configurable: false,
    enumerable: false,
    value: request,
    writable: false,
  })
  return procedure as ClientProcedure<Procedure>
}

export function createHttpTransport(options: HttpTransportOptions = {}): HttpTransport {
  const baseUrl = (options.baseUrl ?? '/api').replace(/\/+$/, '')
  const fetcher = options.fetch ?? globalThis.fetch

  const request: HttpTransport['request'] = async (route, requestOptions, ...args) => {
    const configuredHeaders = typeof options.headers === 'function' ? await options.headers() : options.headers
    const built = createRequest(baseUrl, route, args, configuredHeaders, requestOptions)
    const response = await fetcher(built.url, built.init)
    const text = await response.text()
    if (!response.ok) {
      const error = parseError(text)
      throw new HullaAPIError(response, error)
    }
    return (response.status === 204 || text.length === 0 ? undefined : decodeHTTPValue(text)) as never
  }

  return {
    call: (route, ...args) => request(route, {}, ...args),
    request,
  }
}

/** @internal Identity schema used by generated clients for types without browser-side validation. */
export function clientSchema<T>(): Schema<T, T> {
  return {
    parse: (value) => value as T,
    _input: undefined as never,
    _output: undefined as never,
  }
}

function createRequest(
  baseUrl: string,
  route: HTTPRoute | HTTPRouteContract,
  args: readonly unknown[],
  configuredHeaders: HeadersInit | undefined,
  requestOptions: ClientRequestOptions
): { url: string; init: RequestInit } {
  const parameters = [...route.path.matchAll(/:([A-Za-z_$][\w$]*)/g)].map((match) => match[1]!)
  const contractInput = 'input' in route ? route.input : undefined
  const positional = contractInput?.kind === 'tuple' || (contractInput === undefined && args.length > 1)
  const first = args[0]
  const objectInput = !positional && isPlainObject(first)
  const remainingObject = objectInput ? { ...(first as Record<string, unknown>) } : undefined
  let path = route.path

  for (const [index, parameter] of parameters.entries()) {
    const value = positional ? args[index] : objectInput ? remainingObject![parameter] : first
    if (value === undefined) throw new TypeError(`Missing route path input "${parameter}".`)
    const wire = contractInputWire(contractInput, positional ? index : objectInput ? parameter : undefined)
    path = path.replace(
      `:${parameter}`,
      encodeURIComponent(wire ? encodeHTTPURLValue(wire, value) : encodeParameter(value))
    )
    if (objectInput) delete remainingObject![parameter]
  }

  const remaining = positional
    ? args.slice(parameters.length)
    : objectInput
      ? Object.keys(remainingObject!).length > 0
        ? [remainingObject]
        : []
      : parameters.length === 0 && args.length > 0
        ? [first]
        : []
  const query = new URLSearchParams()
  let body: string | undefined
  const remainingWires = remainingInputWires(contractInput, parameters, remainingObject)

  if (route.method === 'GET' || route.method === 'HEAD') appendQuery(query, remaining, remainingWires)
  else if (remaining.length === 1 && remaining[0] !== undefined)
    body = encodeHTTPValue(remainingWires[0] ? encodeHTTPBodyValue(remainingWires[0]!, remaining[0]) : remaining[0])
  else if (remaining.length > 1)
    body = encodeHTTPValue(
      remaining.map((value, index) =>
        remainingWires[index] ? encodeHTTPBodyValue(remainingWires[index]!, value) : value
      )
    )

  const headers = new Headers(configuredHeaders)
  new Headers(requestOptions.headers).forEach((value, key) => headers.set(key, value))
  const resolvedHeaders = protocolHeaders(headers)
  resolvedHeaders.set('accept', 'application/json')
  if (body !== undefined) resolvedHeaders.set('content-type', 'application/json')
  const suffix = `${path === '/' ? '' : path}${query.size > 0 ? `?${query}` : ''}`
  return {
    url: `${baseUrl}${suffix}`,
    init: { method: route.method, headers: resolvedHeaders, body, signal: requestOptions.signal },
  }
}

function appendQuery(
  query: URLSearchParams,
  values: readonly unknown[],
  wires: readonly (HTTPWireType | undefined)[] = []
): void {
  if (values.length === 0) return
  if (values.length === 1 && isPlainObject(values[0])) {
    const objectWire = objectHTTPWire(wires[0])
    for (const [key, value] of Object.entries(values[0]))
      appendQueryValue(query, key, value, objectWire?.properties[key])
    return
  }
  if (values.length > 1) {
    if (values.some((value) => value === undefined)) {
      for (const [index, value] of values.entries()) {
        if (value !== undefined) query.append(`input.${index}`, encodeQueryPosition(value, wires[index]))
      }
      return
    }
    for (const [index, value] of values.entries()) query.append('input', encodeQueryPosition(value, wires[index]))
    return
  }
  for (const [index, value] of values.entries()) appendQueryValue(query, 'input', value, wires[index])
}

function encodeQueryPosition(value: unknown, wire?: HTTPWireType): string {
  if (wire) return encodeHTTPURLValue(wire, value)
  if (Array.isArray(value) || isPlainObject(value)) return encodeHTTPValue(value)
  return encodeParameter(value)
}

function appendQueryValue(query: URLSearchParams, key: string, value: unknown, wire?: HTTPWireType): void {
  if (value === undefined) return
  const resolvedWire = wire?.kind === 'optional' ? wire.value : wire
  if (Array.isArray(value) && resolvedWire?.kind === 'array') {
    for (const item of value) appendQueryValue(query, key, item, resolvedWire.items)
    return
  }
  if (Array.isArray(value) && wire === undefined) {
    for (const item of value) appendQueryValue(query, key, item)
    return
  }
  query.append(
    key,
    wire ? encodeHTTPURLValue(wire, value) : isPlainObject(value) ? encodeHTTPValue(value) : encodeParameter(value)
  )
}

function encodeParameter(value: unknown): string {
  if (typeof value === 'string') return value
  if (typeof value === 'number') {
    if (!Number.isFinite(value)) throw new TypeError('HTTP parameters cannot contain non-finite numbers.')
    return String(value)
  }
  if (typeof value === 'boolean' || typeof value === 'bigint') return String(value)
  if (value instanceof Date) {
    if (Number.isNaN(value.getTime())) throw new TypeError('HTTP parameters cannot contain invalid dates.')
    return value.toISOString()
  }
  if (value === null) return 'null'
  throw new TypeError('HTTP path and query parameters must be scalar values.')
}

function contractInputWire(
  input: HTTPRouteContract['input'] | undefined,
  pointer: string | number | undefined
): HTTPWireType | undefined {
  if (!input) return undefined
  if (input.kind === 'tuple') return typeof pointer === 'number' ? input.items[pointer] : undefined
  const objectWire = objectHTTPWire(input.wire)
  if (typeof pointer === 'string' && objectWire) return objectWire.properties[pointer]
  return input.wire
}

function remainingInputWires(
  input: HTTPRouteContract['input'] | undefined,
  parameters: readonly string[],
  remainingObject: Record<string, unknown> | undefined
): (HTTPWireType | undefined)[] {
  if (!input) return []
  if (input.kind === 'tuple') return input.items.slice(parameters.length)
  const objectWire = objectHTTPWire(input.wire)
  if (objectWire && remainingObject) {
    return [
      {
        ...objectWire,
        properties: Object.fromEntries(Object.entries(objectWire.properties).filter(([key]) => key in remainingObject)),
      },
    ]
  }
  return parameters.length === 0 ? [input.wire] : []
}

function parseError(value: string): {
  code: HullaAPIErrorCode
  message: string
  body: HullaAPIErrorBody | string | undefined
} {
  try {
    const parsed = JSON.parse(value) as unknown
    const record = typeof parsed === 'object' && parsed !== null ? (parsed as Record<string, unknown>) : {}
    const code =
      typeof record['code'] === 'string' && hullaAPIErrorCodesSet.has(record['code'])
        ? (record['code'] as HullaAPIErrorCode)
        : 'UNKNOWN_ERROR'
    const message = typeof record['message'] === 'string' ? record['message'] : 'API request failed.'
    return {
      code,
      message,
      body: { ...record, code, message },
    }
  } catch {
    return { code: 'UNKNOWN_ERROR', message: 'API request failed.', body: value || undefined }
  }
}

const hullaAPIErrorCodesSet = new Set<string>(hullaAPIErrorCodes)
