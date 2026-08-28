import type { ClientTransport, ClientTransportRequest, ClientTransportResponse } from '../client/request'
import { ClientResponseError } from '../client/response'

export type ClientFetch<FetchOptions extends object = RequestInit> = (
  request: Request,
  options?: FetchOptions
) => Response | PromiseLike<Response>

export type FetchTransportOptions<FetchOptions extends object = RequestInit> = {
  /** URL prefix placed before the contract base path. Omit it to issue a relative request. */
  readonly baseUrl?: string | URL
  readonly fetch?: ClientFetch<FetchOptions>
  /** Additional options passed as fetch's second argument after @hulla/api constructs the native Request. */
  readonly fetchOptions?: FetchOptions | ((request: ClientTransportRequest) => FetchOptions | undefined)
}

function normalizedBaseUrl(baseUrl: string | URL | undefined): string {
  return baseUrl === undefined ? '' : String(baseUrl).replace(/\/+$/, '')
}

function assertBaseUrl(baseUrl: string | URL | undefined): void {
  if (baseUrl === undefined) return
  const value = String(baseUrl)
  if (value.includes('?')) throw new TypeError(`Fetch base URL "${value}" cannot contain a query string`)
  if (value.includes('#')) throw new TypeError(`Fetch base URL "${value}" cannot contain a hash fragment`)
}

function appendBaseUrl(prefix: string, path: string): string {
  if (prefix === '') return path
  return path === '/' ? prefix || '/' : `${prefix}${path}`
}

function queryString(request: ClientTransportRequest): string {
  if (request.query === undefined) return ''
  const parameters = new URLSearchParams()
  for (const [key, field] of Object.entries(request.query)) {
    if (field === undefined) continue
    if (typeof field !== 'string') {
      for (const value of field) parameters.append(key, value)
    } else parameters.append(key, field)
  }
  const encoded = parameters.toString()
  return encoded === '' ? '' : `?${encoded}`
}

function requestBody(request: ClientTransportRequest): BodyInit | undefined {
  const body = request.body
  if (body === undefined) return undefined
  switch (body.kind) {
    case 'json': {
      const encoded = JSON.stringify(body.value)
      if (encoded === undefined) throw new TypeError('JSON request body cannot encode to undefined')
      return encoded
    }
    case 'text':
      return body.value as string
    case 'bytes':
      return body.value as BodyInit
    case 'form-data':
      if (!(body.value instanceof FormData)) throw new TypeError('Form data request body must be FormData')
      return body.value
  }
}

function nativeRequest(request: ClientTransportRequest, baseUrl: string): Request {
  const body = requestBody(request)
  const url = `${appendBaseUrl(baseUrl, request.path)}${queryString(request)}`
  let hasHeaders = false
  for (const _name in request.headers) {
    hasHeaders = true
    break
  }
  try {
    if (request.method === 'GET' && !hasHeaders && body === undefined && request.signal === undefined) {
      return new Request(url)
    }
    const init: RequestInit = { method: request.method }
    if (hasHeaders) init.headers = request.headers
    if (body !== undefined) init.body = body
    if (request.signal !== undefined) init.signal = request.signal
    return new Request(url, init)
  } catch (cause) {
    if (baseUrl === '' || baseUrl.startsWith('/')) {
      throw new TypeError(
        `Fetch transport cannot construct relative URL "${url}" in this runtime; configure an absolute baseUrl for Node.js or SSR`,
        { cause }
      )
    }
    throw cause
  }
}

function responseHeaders(response: Response): Readonly<Record<string, string>> {
  return Object.fromEntries(response.headers.entries())
}

function responseBytes(response: Response, transportResponse: ClientTransportResponse): AsyncIterable<Uint8Array> {
  async function* read(): AsyncIterable<Uint8Array> {
    if (response.body === null) {
      throw new ClientResponseError('missing-body', transportResponse, `Response ${response.status} has no stream body`)
    }
    const reader = response.body.getReader()
    let complete = false
    try {
      while (true) {
        const result = await reader.read()
        if (result.done) {
          complete = true
          return
        }
        yield result.value
      }
    } finally {
      try {
        if (!complete) await reader.cancel()
      } finally {
        reader.releaseLock()
      }
    }
  }
  return read()
}

function transportResponse(response: Response): ClientTransportResponse {
  let result: ClientTransportResponse
  result = {
    status: response.status,
    headers: responseHeaders(response),
    native: response,
    readBody: (kind) => {
      switch (kind) {
        case 'json':
          return response.json()
        case 'text':
          return response.text()
        case 'bytes':
          return response.arrayBuffer().then((buffer) => new Uint8Array(buffer))
        case 'form-data':
          return response.formData()
        case 'stream':
          return responseBytes(response, result)
        case 'raw':
          return response
      }
    },
  }
  return result
}

/** Creates the Fetch transport for a transport-neutral client definition. */
export function fetchTransport<const FetchOptions extends object = RequestInit>(
  options: FetchTransportOptions<FetchOptions> = {}
): ClientTransport {
  assertBaseUrl(options.baseUrl)
  const baseUrl = normalizedBaseUrl(options.baseUrl)
  const fetcher = (options.fetch ?? globalThis.fetch) as ClientFetch<FetchOptions>
  return (request) => {
    const native = nativeRequest(request, baseUrl)
    const configured = typeof options.fetchOptions === 'function' ? options.fetchOptions(request) : options.fetchOptions
    const response = configured === undefined ? fetcher(native) : fetcher(native, configured)
    return response instanceof Response
      ? transportResponse(response)
      : Promise.resolve(response).then(transportResponse)
  }
}
