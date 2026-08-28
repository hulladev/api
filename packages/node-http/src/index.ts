import type { IncomingHttpHeaders, IncomingMessage, ServerResponse } from 'node:http'
import type { Contract } from '@hulla/api'
import {
  createAdapterHandler,
  type AdapterErrorInput,
  type AdapterResponse,
  type AdapterResponseBody,
  type AdapterRuntimeOptions,
} from '@hulla/api/adapters'
import {
  assertAdapterContext,
  createServerAdapter,
  serverContextAdapterId,
  type Awaitable,
  type ServerAdapter,
  type ServerContextInput,
  type ServerExecutableFor,
} from '@hulla/api/server'

export type NodeHttpRequest = IncomingMessage
export type NodeHttpResponse = ServerResponse<NodeHttpRequest>
export type NodeHttpHandler = (request: NodeHttpRequest, response: NodeHttpResponse) => void

export type NodeHttpAdapterContext = {
  readonly request: NodeHttpRequest
  readonly response: NodeHttpResponse
}

export type NodeHttpContextInput<ContractType extends Contract = Contract> = ServerContextInput<ContractType> &
  NodeHttpAdapterContext

export type NodeHttpServerErrorInput = Omit<AdapterErrorInput, 'hostContext' | 'request'> & NodeHttpAdapterContext

export type NodeHttpServerOptions = Omit<AdapterRuntimeOptions, 'onError'> & {
  readonly onError?: ((input: NodeHttpServerErrorInput) => Awaitable<AdapterResponse | undefined | void>) | undefined
}

export type NodeHttpAdapter = ServerAdapter<'node-http', NodeHttpAdapterContext> & {
  readonly mount: <const ContractType extends Contract, const Context extends object>(
    implementation: ServerExecutableFor<ContractType, Context, 'node-http', NodeHttpAdapterContext>,
    options?: NodeHttpServerOptions
  ) => NodeHttpHandler
}

function pathname(url: string): string {
  const authority = url.indexOf('://')
  const start = authority === -1 ? 0 : url.indexOf('/', authority + 3)
  if (start === -1) return '/'
  const query = url.indexOf('?', start)
  const hash = url.indexOf('#', start)
  const end = query === -1 ? (hash === -1 ? url.length : hash) : hash === -1 ? query : Math.min(query, hash)
  return url.slice(start, end) || '/'
}

function requestQuery(url: string): URLSearchParams | undefined {
  const query = url.indexOf('?')
  if (query === -1) return undefined
  const hash = url.indexOf('#', query + 1)
  return new URLSearchParams(url.slice(query + 1, hash === -1 ? undefined : hash))
}

function requestHeaders(source: IncomingHttpHeaders): Readonly<Record<string, string>> {
  const headers: Record<string, string> = {}
  for (const [name, value] of Object.entries(source)) {
    if (value === undefined || name.startsWith(':')) continue
    headers[name] = typeof value === 'string' ? value : value.join(', ')
  }
  return headers
}

async function readRequestBytes(request: NodeHttpRequest): Promise<Uint8Array> {
  const chunks: Uint8Array[] = []
  let length = 0
  for await (const value of request) {
    const chunk =
      typeof value === 'string'
        ? new TextEncoder().encode(value)
        : value instanceof Uint8Array
          ? value
          : new Uint8Array(value as ArrayBuffer)
    chunks.push(chunk)
    length += chunk.byteLength
  }

  const body = new Uint8Array(length)
  let offset = 0
  for (const chunk of chunks) {
    body.set(chunk, offset)
    offset += chunk.byteLength
  }
  return body
}

function createBodyReader(request: NodeHttpRequest) {
  let body: Promise<Uint8Array> | undefined
  return async (representation: string): Promise<unknown> => {
    const bytes = await (body ??= readRequestBytes(request))
    switch (representation) {
      case 'json':
        return JSON.parse(new TextDecoder().decode(bytes)) as unknown
      case 'text':
        return new TextDecoder().decode(bytes)
      case 'bytes':
        return bytes
      case 'form-data': {
        const contentType = request.headers['content-type']
        return new Response(bytes as BodyInit, {
          ...(contentType === undefined ? {} : { headers: { 'content-type': contentType } }),
        }).formData()
      }
      default:
        throw new TypeError(`Unsupported Node HTTP request body representation ${representation}`)
    }
  }
}

function responseSetCookies(headers: Headers): readonly string[] {
  const compatible = headers as Headers & { getSetCookie?: () => readonly string[] }
  return compatible.getSetCookie?.() ?? []
}

function writeFetchHeaders(source: Headers, target: NodeHttpResponse): void {
  const setCookies = responseSetCookies(source)
  source.forEach((value, name) => {
    if (name !== 'set-cookie' || setCookies.length === 0) target.setHeader(name, value)
  })
  if (setCookies.length > 0) target.setHeader('set-cookie', setCookies)
}

function writeAdapterHeaders(source: Readonly<Record<string, string>>, target: NodeHttpResponse): void {
  for (const [name, value] of Object.entries(source)) target.setHeader(name, value)
}

function waitForDrain(response: NodeHttpResponse): Promise<void> {
  return new Promise((resolve, reject) => {
    const onDrain = () => {
      cleanup()
      resolve()
    }
    const onClose = () => {
      cleanup()
      reject(new Error('Node HTTP response closed before the body finished'))
    }
    const cleanup = () => {
      response.off('drain', onDrain)
      response.off('close', onClose)
    }
    response.once('drain', onDrain)
    response.once('close', onClose)
  })
}

async function writeChunk(response: NodeHttpResponse, chunk: Uint8Array): Promise<void> {
  if (!response.write(chunk)) await waitForDrain(response)
}

async function writeFetchResponse(source: Response, target: NodeHttpResponse, method: string): Promise<void> {
  target.statusCode = source.status
  writeFetchHeaders(source.headers, target)
  if (method === 'HEAD' || source.body === null) {
    target.end()
    return
  }

  const reader = source.body.getReader()
  const cancel = () => void reader.cancel(new Error('Node HTTP response closed'))
  target.once('close', cancel)
  try {
    while (!target.destroyed && !target.writableEnded) {
      const chunk = await reader.read()
      if (chunk.done) break
      await writeChunk(target, chunk.value)
    }
    if (!target.destroyed && !target.writableEnded) target.end()
  } finally {
    target.off('close', cancel)
    reader.releaseLock()
  }
}

type DirectBodyKind = Exclude<AdapterResponseBody['kind'], 'form-data' | 'raw'>

async function writeDirectBody(
  kind: DirectBodyKind,
  value: unknown,
  target: NodeHttpResponse,
  method: string
): Promise<void> {
  if (method === 'HEAD' || kind === 'empty') {
    target.end()
    return
  }

  switch (kind) {
    case 'json':
      if (value === undefined) throw new TypeError('JSON response body cannot encode to undefined')
      target.end(JSON.stringify(value))
      return
    case 'text':
      if (typeof value !== 'string') throw new TypeError('Text response body must be a string')
      target.end(value)
      return
    case 'bytes':
      if (!(value instanceof Uint8Array)) throw new TypeError('Byte response body must be Uint8Array')
      target.end(value)
      return
    case 'stream': {
      const stream = value as AsyncIterable<unknown> & Iterable<unknown>
      if (typeof stream?.[Symbol.asyncIterator] !== 'function' && typeof stream?.[Symbol.iterator] !== 'function') {
        throw new TypeError('Stream response body must be iterable')
      }
      for await (const chunk of stream) {
        if (target.destroyed || target.writableEnded) break
        if (!(chunk instanceof Uint8Array)) throw new TypeError('Stream chunk must be Uint8Array')
        await writeChunk(target, chunk)
      }
      if (!target.destroyed && !target.writableEnded) target.end()
      return
    }
  }
}

async function writeAdapterResponse(source: AdapterResponse, target: NodeHttpResponse, method: string): Promise<void> {
  const body = source.body
  if (body.kind === 'raw') {
    if (!(body.value instanceof Response) || body.value.status !== source.status) {
      throw new TypeError('Raw Fetch response status must match its declared contract status')
    }
    await writeFetchResponse(body.value, target, method)
    return
  }
  if (body.kind === 'form-data') {
    if (!(body.value instanceof FormData)) throw new TypeError('Form data response body must be FormData')
    const response = new Response(body.value, { status: source.status, headers: source.headers })
    void response.headers.get('content-type')
    await writeFetchResponse(response, target, method)
    return
  }

  target.statusCode = source.status
  writeAdapterHeaders(source.headers, target)
  await writeDirectBody(body.kind, body.value, target, method)
}

function transportFailure(_error: unknown, response: NodeHttpResponse): void {
  if (response.destroyed || response.writableEnded) return
  if (response.headersSent) {
    response.destroy()
    return
  }
  response.statusCode = 500
  response.setHeader('content-type', 'text/plain; charset=utf-8')
  response.end('Internal Server Error')
}

function createNodeHttpHandler<const ContractType extends Contract, const Context extends object>(
  implementation: ServerExecutableFor<ContractType, Context, 'node-http', NodeHttpAdapterContext>,
  options: NodeHttpServerOptions = {}
): NodeHttpHandler {
  assertAdapterContext(implementation.context, 'node-http')
  const usesNativeContext = serverContextAdapterId(implementation.context) !== undefined
  const dispatch = createAdapterHandler(
    implementation,
    options.onError === undefined
      ? {}
      : {
          onError: ({ hostContext, ...input }) =>
            options.onError?.({ ...input, ...(hostContext as NodeHttpAdapterContext) }),
        }
  )

  return (request, response) => {
    const method = request.method?.toUpperCase() ?? ''
    const dispatchMethod = method === 'HEAD' ? 'GET' : method
    const url = request.url ?? '/'
    const query = requestQuery(url)
    const nativeContext: NodeHttpAdapterContext = { request, response }
    const execute = async () => {
      const result = await dispatch({
        request,
        method: dispatchMethod,
        pathname: pathname(url),
        ...(query === undefined ? {} : { query }),
        readHeaders: () => requestHeaders(request.headers),
        readBody: createBodyReader(request),
        ...(usesNativeContext ? { contextInput: nativeContext } : {}),
        ...(options.onError === undefined ? {} : { hostContext: nativeContext }),
      })
      await writeAdapterResponse(result, response, method)
    }
    void execute().catch((error: unknown) => transportFailure(error, response))
  }
}

let nodeHttpAdapterValue: NodeHttpAdapter | undefined

function createNodeHttpAdapter(defaults: NodeHttpServerOptions): NodeHttpAdapter {
  return createServerAdapter('node-http', {
    mount: <const ContractType extends Contract, const Context extends object>(
      implementation: ServerExecutableFor<ContractType, Context, 'node-http', NodeHttpAdapterContext>,
      options?: NodeHttpServerOptions
    ) => createNodeHttpHandler(implementation, options === undefined ? defaults : { ...defaults, ...options }),
  }) as unknown as NodeHttpAdapter
}

/** Creates a dependency-free Node.js HTTP adapter for one server implementation or fragment. */
export function nodeHttpAdapter(options?: NodeHttpServerOptions): NodeHttpAdapter {
  if (options !== undefined) return createNodeHttpAdapter({ ...options })
  nodeHttpAdapterValue ??= createNodeHttpAdapter({})
  return nodeHttpAdapterValue
}
