import type { IncomingHttpHeaders, IncomingMessage, ServerResponse } from 'node:http'
import type { Contract } from '@hulla/api'
import {
  createAdapterHandler,
  bodyLimit,
  readBodyBytes,
  errorResponse,
  type AdapterErrorInput,
  type AdapterResponse,
  type AdapterRuntimeOptions,
} from '@hulla/api/adapters'
import { nodeRequestLifetime, writeNodeResponse } from '@hulla/api/adapters/node'
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
  readonly maxBodyBytes?: number
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

function createBodyReader(request: NodeHttpRequest, limit: number) {
  let body: Promise<Uint8Array> | undefined
  return async (representation: string): Promise<unknown> => {
    const bytes = await (body ??= readBodyBytes(
      request.iterator({ destroyOnReturn: false }) as AsyncIterable<Uint8Array>,
      limit
    ).catch((error) => {
      request.resume()
      throw error
    }))
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
  const limit = bodyLimit(options.maxBodyBytes)
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
    const lifetime = nodeRequestLifetime(request, response)
    const method = request.method?.toUpperCase() ?? ''
    const dispatchMethod = method === 'HEAD' ? 'GET' : method
    const url = request.url ?? '/'
    const query = requestQuery(url)
    const nativeContext: NodeHttpAdapterContext = { request, response }
    const execute = async () => {
      const result = await dispatch({
        request,
        signal: lifetime.signal,
        method: dispatchMethod,
        pathname: pathname(url),
        ...(query === undefined ? {} : { query }),
        readHeaders: () => requestHeaders(request.headers),
        readBody: createBodyReader(request, limit),
        ...(usesNativeContext ? { contextInput: nativeContext } : {}),
        ...(options.onError === undefined ? {} : { hostContext: nativeContext }),
      })
      await writeNodeResponse(result, response, method)
    }
    void execute()
      .catch(async (error: unknown) => {
        const fallback = errorResponse(error, 'transport')
        let replacement: AdapterResponse | undefined | void
        try {
          replacement = await options.onError?.({
            error,
            phase: 'transport',
            request,
            response,
            defaultResponse: fallback,
          })
        } catch {
          /* Observer failures do not recurse. */
        }
        if (response.headersSent) {
          response.destroy()
          return
        }
        for (const name of response.getHeaderNames()) response.removeHeader(name)
        try {
          await writeNodeResponse(replacement ?? fallback, response, method)
        } catch (failure) {
          transportFailure(failure, response)
        }
      })
      .finally(lifetime.dispose)
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
