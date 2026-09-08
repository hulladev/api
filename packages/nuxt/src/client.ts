import type { ClientTransport, ClientTransportRequest, ClientTransportResponse } from '@hulla/api/client'
import { ClientResponseError } from '@hulla/api/client'
import type { $Fetch } from 'ofetch'

export type NuxtRequestFetch =
  | Pick<$Fetch, 'raw'>
  | {
      /** Nitro's request-scoped event.fetch preserves local dispatch and native response metadata. */
      readonly fetch: (url: string, options: RequestInit) => Promise<Response>
    }

export type NuxtFetchTransportOptions = {
  /** URL prefix placed before the contract base path. Relative paths retain Nitro's local SSR dispatch. */
  readonly baseUrl?: string | URL
}

function normalizedBaseUrl(baseUrl: string | URL | undefined): string {
  return baseUrl === undefined ? '' : String(baseUrl).replace(/\/+$/, '')
}

function assertBaseUrl(baseUrl: string | URL | undefined): void {
  if (baseUrl === undefined) return
  const value = String(baseUrl)
  if (value.includes('?')) throw new TypeError(`Nuxt fetch base URL "${value}" cannot contain a query string`)
  if (value.includes('#')) throw new TypeError(`Nuxt fetch base URL "${value}" cannot contain a hash fragment`)
}

function appendBaseUrl(prefix: string, path: string): string {
  if (prefix === '') return path
  return path === '/' ? prefix || '/' : `${prefix}${path}`
}

function requestUrl(request: ClientTransportRequest, baseUrl: string): string {
  const url = appendBaseUrl(baseUrl, request.path)
  if (request.query === undefined) return url
  const parameters = new URLSearchParams()
  for (const [key, field] of Object.entries(request.query)) {
    if (field === undefined) continue
    if (typeof field === 'string') parameters.append(key, field)
    else for (const value of field) parameters.append(key, value)
  }
  const encoded = parameters.toString()
  return encoded === '' ? url : `${url}?${encoded}`
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

/** Preserves response metadata over browser $fetch.raw or Nitro's request-scoped event.fetch. */
export function nuxtFetchTransport(
  fetcher: NuxtRequestFetch,
  options: NuxtFetchTransportOptions = {}
): ClientTransport {
  assertBaseUrl(options.baseUrl)
  const baseUrl = normalizedBaseUrl(options.baseUrl)
  const nativeFetch = 'fetch' in fetcher ? fetcher.fetch : undefined
  const rawFetch = 'raw' in fetcher ? fetcher.raw : undefined
  if (typeof nativeFetch !== 'function' && typeof rawFetch !== 'function') {
    throw new TypeError(
      'Nuxt transport requires $fetch.raw or { fetch: event.fetch }; useRequestFetch() can return a parsed-only fetcher on the server'
    )
  }
  const send =
    typeof nativeFetch === 'function'
      ? (url: string, init: RequestInit) => nativeFetch(url, init)
      : (url: string, init: RequestInit) =>
          rawFetch!(url, {
            ...init,
            ignoreResponseError: true,
            responseType: 'stream',
            retry: false,
          })
  return async (request) => {
    request.signal?.throwIfAborted()
    const body = requestBody(request)
    const response = await send(requestUrl(request, baseUrl), {
      ...(body === undefined ? {} : { body }),
      headers: request.headers,
      method: request.method,
      ...(request.signal === undefined ? {} : { signal: request.signal }),
    })
    return transportResponse(response)
  }
}
