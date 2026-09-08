import type { ClientTransport, ClientTransportRequest } from '@hulla/api/client'
import { fetchTransportResponse } from '@hulla/api/fetch'
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
    return fetchTransportResponse(response)
  }
}
