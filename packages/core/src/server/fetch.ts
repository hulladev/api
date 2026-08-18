import type { Contract } from '../contract'
import type { Awaitable, RouteMetadata } from './context'
import { createWireHandler } from './runtime'
import type { WireServerErrorInput, WireServerInput, WireServerPhase, WireServerResponse } from './runtime'
import type { ServerImplementation } from './types'

export type FetchServerPhase = WireServerPhase

export type FetchServerErrorInput = {
  readonly defaultResponse: Response
  readonly error: unknown
  readonly phase: FetchServerPhase
  readonly request: Request
  readonly route?: RouteMetadata
}

export type FetchServerOptions = {
  readonly onError?: (input: FetchServerErrorInput) => Awaitable<Response | undefined | void>
}

export type FetchHandler = (request: Request) => Promise<Response>

function pathname(url: string): string {
  const authority = url.indexOf('://')
  const start = authority === -1 ? 0 : url.indexOf('/', authority + 3)
  if (start === -1) return '/'
  const query = url.indexOf('?', start)
  const hash = url.indexOf('#', start)
  const end = query === -1 ? (hash === -1 ? url.length : hash) : hash === -1 ? query : Math.min(query, hash)
  return url.slice(start, end) || '/'
}

function requestHeaders(request: Request): Readonly<Record<string, string>> {
  return Object.fromEntries(request.headers.entries())
}

function requestQuery(url: string): URLSearchParams | undefined {
  const query = url.indexOf('?')
  if (query === -1) return undefined
  const hash = url.indexOf('#', query + 1)
  return new URLSearchParams(url.slice(query + 1, hash === -1 ? undefined : hash))
}

async function readBody(request: Request, representation: string, preserveRequest: boolean): Promise<unknown> {
  const source = preserveRequest ? request.clone() : request
  switch (representation) {
    case 'json':
      return source.json()
    case 'text':
      return source.text()
    case 'bytes':
      return new Uint8Array(await source.arrayBuffer())
    case 'form-data':
      return source.formData()
    default:
      throw new TypeError(`Unsupported Fetch request body representation ${representation}`)
  }
}

function responseBody(response: WireServerResponse): BodyInit | null {
  const body = response.body
  switch (body.kind) {
    case 'empty':
      return null
    case 'json': {
      const json = JSON.stringify(body.value)
      if (json === undefined) throw new TypeError('JSON response body cannot encode to undefined')
      return json
    }
    case 'text':
      if (typeof body.value !== 'string') throw new TypeError('Text wire response body must be a string')
      return body.value
    case 'bytes':
      if (!(body.value instanceof Uint8Array)) throw new TypeError('Byte wire response body must be Uint8Array')
      return body.value as BodyInit
    case 'form-data':
      if (!(body.value instanceof FormData)) throw new TypeError('Form data wire response body must be FormData')
      return body.value
    case 'stream':
      if (!(body.value instanceof ReadableStream))
        throw new TypeError('Stream wire response body must be ReadableStream')
      return body.value as unknown as BodyInit
    case 'raw':
      throw new TypeError('Raw wire responses are returned directly')
  }
}

function toResponse(response: WireServerResponse): Response {
  const body = response.body
  if (body.kind === 'raw') {
    if (!(body.value instanceof Response) || body.value.status !== response.status) {
      throw new TypeError('Raw Fetch response status must match its declared contract status')
    }
    return body.value
  }
  if (body.kind === 'json') {
    if (body.value === undefined) throw new TypeError('JSON response body cannot encode to undefined')
    return Response.json(body.value, { status: response.status, headers: response.headers })
  }
  return new Response(responseBody(response), { status: response.status, headers: response.headers })
}

function replacementResponse(response: Response): WireServerResponse {
  return {
    status: response.status,
    headers: {},
    body: { kind: 'raw', value: response },
  }
}

/** Creates a Web Fetch handler over the adapter-facing @hulla/api wire executor. */
export function createFetchHandler<const ContractType extends Contract, const Context extends object>(
  implementation: ServerImplementation<ContractType, Context>,
  options: FetchServerOptions = {}
): FetchHandler {
  const onWireError =
    options.onError === undefined
      ? undefined
      : async (input: WireServerErrorInput): Promise<WireServerResponse | undefined> => {
          const replacement = await options.onError?.({
            error: input.error,
            phase: input.phase,
            request: input.request,
            ...(input.route === undefined ? {} : { route: input.route }),
            defaultResponse: toResponse(input.defaultResponse).clone(),
          })
          return replacement instanceof Response ? replacementResponse(replacement) : undefined
        }
  const dispatch = createWireHandler(implementation, onWireError === undefined ? {} : { onError: onWireError })

  return async (request) => {
    if (!(request instanceof Request)) throw new TypeError('Fetch handler input must be a Request')
    let headers: Readonly<Record<string, string>> | undefined
    const query = requestQuery(request.url)
    const input: WireServerInput = {
      request,
      method: request.method,
      pathname: pathname(request.url),
      readHeaders: () => (headers ??= requestHeaders(request)),
      readBody: (representation, preserveRequest) => readBody(request, representation, preserveRequest),
    }
    const response = await dispatch(query === undefined ? input : { ...input, query })
    return toResponse(response)
  }
}
