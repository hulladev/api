import type { ApiHandler } from '@hulla/api/server'

export type ExpressRequest = {
  readonly method: string
  readonly originalUrl?: string
  readonly url: string
  readonly protocol?: string
  readonly headers: Record<string, string | readonly string[] | undefined>
  readonly body?: unknown
  readonly socket?: { readonly encrypted?: boolean }
  on?(event: 'close', listener: () => void): void
}

export type ExpressResponse = {
  status(code: number): ExpressResponse
  setHeader(name: string, value: string | readonly string[]): void
  send(body?: unknown): void
}

export type ExpressNext = (error?: unknown) => void
export type ExpressApiMiddleware = (
  request: ExpressRequest,
  response: ExpressResponse,
  next: ExpressNext
) => void | Promise<void>

export function createExpressMiddleware(handler: ApiHandler): ExpressApiMiddleware {
  return async (request, response, next) => {
    try {
      const controller = new AbortController()
      request.on?.('close', () => controller.abort())
      const fetchResponse = await handler.fetch(toRequest(request, controller.signal))

      response.status(fetchResponse.status)
      fetchResponse.headers.forEach((value, name) => response.setHeader(name, value))
      const body = new Uint8Array(await fetchResponse.arrayBuffer())
      response.send(body.byteLength === 0 ? undefined : body)
    } catch (error) {
      next(error)
    }
  }
}

function toRequest(request: ExpressRequest, signal: AbortSignal): Request {
  const protocol = request.protocol ?? (request.socket?.encrypted ? 'https' : 'http')
  const host = firstHeader(request.headers['host']) ?? 'localhost'
  const headers = new Headers()
  for (const [name, value] of Object.entries(request.headers)) {
    if (value === undefined) continue
    if (typeof value === 'string') headers.set(name, value)
    else for (const item of value) headers.append(name, item)
  }
  const method = request.method.toUpperCase()
  const body = method === 'GET' || method === 'HEAD' ? undefined : requestBody(request.body, headers)
  return new Request(`${protocol}://${host}${request.originalUrl ?? request.url}`, { method, headers, body, signal })
}

function requestBody(value: unknown, headers: Headers): BodyInit | undefined {
  if (value === undefined || value === null) return undefined
  if (typeof value === 'string') return value
  if (value instanceof Uint8Array || value instanceof ArrayBuffer) return new Blob([value as BlobPart])
  if (!headers.has('content-type')) headers.set('content-type', 'application/json')
  return JSON.stringify(value)
}

function firstHeader(value: string | readonly string[] | undefined): string | undefined {
  return typeof value === 'string' || value === undefined ? value : value[0]
}
