import { fromFetchHeaders } from '../adapters/headers'
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

/** Adapts a native Fetch response with cancellable body ownership and repeated headers. */
export function fetchTransportResponse(response: Response): ClientTransportResponse {
  let reader: ReadableStreamDefaultReader<Uint8Array> | undefined
  let disposed = false
  async function* bytes(): AsyncIterable<Uint8Array> {
    if (disposed) throw new TypeError('Response has been disposed')
    if (response.body === null) return
    const active = response.body.getReader()
    reader = active
    let complete = false
    try {
      while (true) {
        const item = await active.read()
        if (item.done) {
          complete = true
          return
        }
        yield item.value
      }
    } finally {
      try {
        if (!complete) await active.cancel()
      } finally {
        reader = undefined
        active.releaseLock()
      }
    }
  }
  async function buffered(): Promise<Uint8Array> {
    const chunks: Uint8Array[] = []
    let length = 0
    for await (const chunk of bytes()) {
      chunks.push(chunk)
      length += chunk.byteLength
    }
    if (chunks.length === 1) return chunks[0]!
    const value = new Uint8Array(length)
    let offset = 0
    for (const chunk of chunks) {
      value.set(chunk, offset)
      offset += chunk.byteLength
    }
    return value
  }
  const result: ClientTransportResponse = {
    status: response.status,
    headers: fromFetchHeaders(response.headers),
    native: response,
    dispose: async (reason) => {
      disposed = true
      if (reader !== undefined) await reader.cancel(reason)
      else if (response.body !== null && !response.body.locked) await response.body.cancel(reason)
    },
    readBody: (kind, options) => {
      if (options?.cancellable !== true) {
        switch (kind) {
          case 'json':
            return response.json()
          case 'text':
            return response.text()
          case 'bytes':
            return response.arrayBuffer().then((buffer) => new Uint8Array(buffer))
          case 'form-data':
            return response.formData()
        }
      }
      switch (kind) {
        case 'json':
          return buffered().then((value) => JSON.parse(new TextDecoder().decode(value)) as unknown)
        case 'text':
          return buffered().then((value) => new TextDecoder().decode(value))
        case 'bytes':
          return buffered()
        case 'form-data':
          return buffered().then((value) => new Response(value as BodyInit, { headers: response.headers }).formData())
        case 'stream':
          if (response.body === null)
            throw new ClientResponseError('missing-body', result, `Response ${response.status} has no stream body`)
          return bytes()
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
      ? fetchTransportResponse(response)
      : Promise.resolve(response).then(fetchTransportResponse)
  }
}
