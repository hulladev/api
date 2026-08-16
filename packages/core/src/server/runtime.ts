import { compileContract, type CompiledContractRoute } from '../compiler'
import type { Awaitable, RouteMetadata } from '../context'
import type { Contract } from '../contract'
import { isAPIError, toAPIProblem, type APIProblem } from '../errors'
import { dispatchMiddlewares } from '../middleware'
import { copyRecord, hasOwn, isRecord, setOwn } from '../object'
import { decodePathParameters } from '../parameters'
import { decodeQuery } from '../query'
import { matchesContentType, mimeEssence, textWireObject, type AnyRequestBody } from '../request'
import type { AnyRouteResponse } from '../response'
import type { StreamFormat, StreamSource } from '../stream'
import {
  decodeSchemaValue,
  encodeSchemaValue,
  isSchemaStepAsync,
  mapSchemaStep,
  type AnySchema,
  type SchemaStep,
} from '../validation'
import { ServerRuntimeError } from './errors'
import type { ServerImplementation } from './types'

export type FetchServerPhase = 'context' | 'handler' | 'request' | 'response' | 'routing'

export type FetchServerErrorInput = {
  readonly defaultResponse: Response
  readonly error: unknown
  readonly phase: FetchServerPhase
  readonly request: Request
  readonly route?: RouteMetadata
}

export type FetchServerOptions = {
  /** Optionally replace the runtime's protocol-safe error response. */
  readonly onError?: (input: FetchServerErrorInput) => Awaitable<Response | undefined | void>
}

export type FetchHandler = (request: Request) => Promise<Response>

type MatchedRoute = {
  readonly runtime: RuntimeRoute
  readonly parameters: Readonly<Record<string, string>>
}

type ProducedResponseMetadata = {
  readonly definition: AnyRouteResponse
}

type RuntimeServer = {
  readonly context?: (input: { readonly request: Request; readonly route: RouteMetadata }) => Awaitable<object>
  readonly contract: Contract
  readonly handlers: unknown
  readonly middlewares: unknown
}

type RuntimeHandler = (actions: object, input: object) => Awaitable<unknown>

type RuntimeRoute = {
  readonly compiled: CompiledContractRoute
  readonly handler: RuntimeHandler
  readonly handlerActions: Readonly<{ readonly respond: (value: unknown) => unknown }>
  readonly metadata: RouteMetadata
  readonly middlewares: readonly unknown[]
  readonly pattern: readonly string[]
}

type RuntimeRoutingNode = {
  parameter?: RuntimeRoutingNode
  readonly routes: RuntimeRoute[]
  readonly static: Map<string, RuntimeRoutingNode>
}

type RuntimeRoutingTable = {
  readonly exact: Map<string, readonly RuntimeRoute[]>
  readonly root: RuntimeRoutingNode
}

type RouteSelection =
  | { readonly kind: 'match'; readonly match: MatchedRoute }
  | { readonly allowed: readonly string[]; readonly kind: 'miss' }

const emptyParameters = Object.freeze({})
const emptyContext = Object.freeze({})
const producedResponses = new WeakMap<object, ProducedResponseMetadata>()

function pathSegments(path: string): readonly string[] {
  if (path === '' || path === '/') return []
  return path.startsWith('/') ? path.slice(1).split('/') : path.split('/')
}

function decodePathname(pathname: string): readonly string[] {
  try {
    return pathSegments(pathname).map((segment) => decodeURIComponent(segment))
  } catch (cause) {
    throw new ServerRuntimeError('invalid-path-encoding', 400, 'Request path contains invalid percent encoding', {
      cause,
      location: 'params',
    })
  }
}

function capturePathParameters(runtime: RuntimeRoute, segments: readonly string[]): Readonly<Record<string, string>> {
  if (runtime.compiled.pathParameters.length === 0) return emptyParameters

  const parameters: Record<string, string> = {}
  for (let index = 0; index < runtime.pattern.length; index++) {
    const expected = runtime.pattern[index]!
    if (expected.startsWith(':')) setOwn(parameters, expected.slice(1), segments[index]!)
  }
  return Object.freeze(parameters)
}

function routingNode(): RuntimeRoutingNode {
  return { routes: [], static: new Map() }
}

function matchingRuntimeRoutes(
  node: RuntimeRoutingNode,
  segments: readonly string[],
  index: number,
  matches: RuntimeRoute[]
): void {
  if (index === segments.length) {
    matches.push(...node.routes)
    return
  }

  const segment = segments[index]!
  const staticNode = node.static.get(segment)
  if (staticNode !== undefined) matchingRuntimeRoutes(staticNode, segments, index + 1, matches)
  if (node.parameter !== undefined) matchingRuntimeRoutes(node.parameter, segments, index + 1, matches)
}

function selectCandidates(
  candidates: readonly RuntimeRoute[],
  method: string,
  segments?: readonly string[]
): RouteSelection {
  const allowed = new Set<string>()
  for (const runtime of candidates) {
    if (runtime.compiled.method === method) {
      return {
        kind: 'match',
        match: {
          runtime,
          parameters: segments === undefined ? emptyParameters : capturePathParameters(runtime, segments),
        },
      }
    }
    allowed.add(runtime.compiled.method)
  }
  return { kind: 'miss', allowed: [...allowed] }
}

function selectRoute(table: RuntimeRoutingTable, pathname: string, method: string): RouteSelection {
  if (!pathname.includes('%')) {
    const exact = table.exact.get(pathname)
    if (exact !== undefined) return selectCandidates(exact, method)
  }

  const segments = decodePathname(pathname)
  const candidates: RuntimeRoute[] = []
  matchingRuntimeRoutes(table.root, segments, 0, candidates)
  if (candidates.length === 0) return { kind: 'miss', allowed: [] }
  return selectCandidates(candidates, method, segments)
}

function treeValue(tree: unknown, key: readonly string[]): unknown {
  let value = tree
  for (const segment of key) {
    if (!isRecord(value) || !hasOwn(value, segment)) return undefined
    value = value[segment]
  }
  return value
}

function compileRuntimeRoutes(server: RuntimeServer): RuntimeRoutingTable {
  const root = routingNode()
  const exact = new Map<string, RuntimeRoute[]>()

  for (const compiled of compileContract(server.contract).routes as readonly CompiledContractRoute[]) {
    const handler = treeValue(server.handlers, compiled.key)
    const middlewares = treeValue(server.middlewares, compiled.key)
    if (typeof handler !== 'function' || !Array.isArray(middlewares)) {
      throw new ServerRuntimeError(
        'invalid-server-response',
        500,
        'Compiled route is missing its server implementation'
      )
    }

    const pattern = Object.freeze(pathSegments(compiled.path))
    const runtime = Object.freeze({
      compiled,
      handler: handler as RuntimeHandler,
      handlerActions: Object.freeze({ respond: responseProducer(compiled.route.responses) }),
      metadata: Object.freeze({ key: compiled.key, method: compiled.method, path: compiled.path }),
      middlewares: Object.freeze([...middlewares]),
      pattern,
    })

    if (compiled.pathParameters.length === 0) {
      const candidates = exact.get(compiled.path)
      if (candidates === undefined) exact.set(compiled.path, [runtime])
      else candidates.push(runtime)
    }

    let node = root
    for (const segment of pattern) {
      if (segment.startsWith(':')) {
        node.parameter ??= routingNode()
        node = node.parameter
        continue
      }

      let child = node.static.get(segment)
      if (child === undefined) {
        child = routingNode()
        node.static.set(segment, child)
      }
      node = child
    }
    node.routes.push(runtime)
  }

  return { exact, root }
}

function requestPathname(url: string): string {
  const authority = url.indexOf('://')
  const start = authority === -1 ? 0 : url.indexOf('/', authority + 3)
  if (start === -1) return '/'

  const query = url.indexOf('?', start)
  const hash = url.indexOf('#', start)
  const end = query === -1 ? (hash === -1 ? url.length : hash) : hash === -1 ? query : Math.min(query, hash)
  return url.slice(start, end) || '/'
}

function problemResponse(problem: APIProblem, headers?: HeadersInit): Response {
  const responseHeaders = new Headers(headers)
  responseHeaders.set('content-type', 'application/problem+json; charset=utf-8')
  return new Response(JSON.stringify(problem), { status: problem.status, headers: responseHeaders })
}

function simpleProblem(status: number, code: string, title: string, headers?: HeadersInit): Response {
  return problemResponse(Object.freeze({ type: 'about:blank', title, status, code }), headers)
}

function errorResponse(error: unknown, phase: FetchServerPhase): Response {
  if (phase === 'request' || phase === 'routing') {
    if (error instanceof ServerRuntimeError) {
      return problemResponse(toAPIProblem(error, { status: error.status, title: error.message }))
    }
    if (isAPIError(error)) return problemResponse(toAPIProblem(error, { status: 400, title: 'Invalid request' }))
  }

  return simpleProblem(500, 'internal-server-error', 'Internal server error')
}

async function parseRequestBody(request: Request, declaration: AnyRequestBody): Promise<unknown> {
  const contentType = request.headers.get('content-type') ?? ''
  if (!matchesContentType(declaration, contentType)) {
    throw new ServerRuntimeError(
      'unsupported-media-type',
      415,
      `Expected request content type ${mimeEssence(declaration.contentType)}, received ${mimeEssence(contentType) || 'none'}`,
      { location: 'body' }
    )
  }

  let wire: unknown
  try {
    switch (declaration.representation) {
      case 'json':
        wire = await request.json()
        break
      case 'text':
        wire = await request.text()
        break
      case 'bytes':
        wire = new Uint8Array(await request.arrayBuffer())
        break
      case 'form-data':
        wire = await request.formData()
        break
    }
  } catch (cause) {
    throw new ServerRuntimeError('invalid-request-body', 400, 'Request body could not be decoded', {
      cause,
      location: 'body',
    })
  }

  return decodeSchemaValue(declaration.schema, wire, { location: 'body' })
}

async function decodeRouteInput(
  match: MatchedRoute,
  request: Request,
  url: URL | undefined
): Promise<Record<string, unknown>> {
  const compiled = match.runtime.compiled
  const route = compiled.route
  const input: Record<string, unknown> = {}
  const hasParams = compiled.pathParameters.length > 0
  const hasQuery = 'query' in route
  const hasHeaders = 'headers' in route
  const hasBody = 'body' in route

  const fieldCount = Number(hasParams) + Number(hasQuery) + Number(hasHeaders) + Number(hasBody)
  let params: unknown
  let query: unknown
  let headers: unknown
  let body: unknown

  if (fieldCount === 1) {
    if (hasParams) params = await decodePathParameters(compiled.pathParameters, match.parameters)
    else if (hasQuery) query = await decodeQuery(route.query, url!.searchParams)
    else if (hasHeaders) {
      headers = await decodeSchemaValue(route.headers, Object.fromEntries(request.headers.entries()), {
        location: 'headers',
      })
    } else if (hasBody) body = await parseRequestBody(request, route.body)
  } else if (fieldCount > 1) {
    ;[params, query, headers, body] = await Promise.all([
      hasParams ? decodePathParameters(compiled.pathParameters, match.parameters) : undefined,
      hasQuery ? decodeQuery(route.query, url!.searchParams) : undefined,
      hasHeaders
        ? decodeSchemaValue(route.headers, Object.fromEntries(request.headers.entries()), { location: 'headers' })
        : undefined,
      hasBody ? parseRequestBody(request, route.body) : undefined,
    ])
  }

  if (hasParams) input['params'] = params
  if (hasQuery) input['query'] = query
  if (hasHeaders) input['headers'] = headers
  if (hasBody) input['body'] = body

  return input
}

function responseProducer(responses: Readonly<Record<number, AnyRouteResponse>>) {
  return (value: unknown): unknown => {
    if (!isRecord(value) || typeof value['status'] !== 'number' || !hasOwn(responses, value['status'])) {
      throw new ServerRuntimeError(
        'invalid-server-response',
        500,
        'Server response must use a status declared by the selected responder'
      )
    }

    const produced = copyRecord(value)
    producedResponses.set(produced, { definition: responses[value['status']]! })
    return produced
  }
}

function errorProducer(errors: Readonly<Record<number, AnyRouteResponse>>) {
  const produce = responseProducer(errors)
  return (status: number, value: unknown): unknown => {
    if (!isRecord(value)) {
      throw new ServerRuntimeError('invalid-server-response', 500, 'Server error response must be an object')
    }
    const response = copyRecord(value)
    setOwn(response, 'status', status)
    return produce(response)
  }
}

async function* encodedStream(source: StreamSource<unknown>, schema: AnySchema): AsyncIterable<unknown> {
  for await (const value of source) yield await encodeSchemaValue(schema, value, { location: 'response' })
}

function byteStream(source: StreamSource<unknown>): ReadableStream<Uint8Array> {
  const asyncSource = source as AsyncIterable<unknown>
  const iterator =
    typeof asyncSource[Symbol.asyncIterator] === 'function'
      ? asyncSource[Symbol.asyncIterator]()
      : (source as Iterable<unknown>)[Symbol.iterator]()
  return new ReadableStream<Uint8Array>({
    async pull(controller) {
      try {
        const result = await iterator.next()
        if (result.done) controller.close()
        else if (result.value instanceof Uint8Array) controller.enqueue(result.value)
        else controller.error(new TypeError('Response stream chunks must encode to Uint8Array'))
      } catch (error) {
        controller.error(error)
      }
    },
    async cancel(reason) {
      await iterator.return?.(reason)
    },
  })
}

function responseHeaders(definition: AnyRouteResponse, value: unknown): SchemaStep<HeadersInit | undefined> {
  if (definition.headers === undefined) return value as HeadersInit | undefined
  return mapSchemaStep(
    encodeSchemaValue(definition.headers, value as never, { location: 'headers' }),
    (encodedValue) => {
      const encoded = textWireObject(encodedValue, 'headers')
      const headers = new Headers()
      for (const [key, field] of Object.entries(encoded)) {
        if (field !== undefined) headers.set(key, field)
      }
      return headers
    }
  )
}

type SerializedResponseBody = {
  readonly body: BodyInit | null
  readonly formData: boolean
}

function serializeResponseBody(definition: AnyRouteResponse, value: unknown): SchemaStep<SerializedResponseBody> {
  const body = definition.body

  switch (body.kind) {
    case 'empty':
      return { body: null, formData: false }
    case 'json': {
      return mapSchemaStep(encodeSchemaValue(body.schema, value as never, { location: 'response' }), (encoded) => {
        const json = JSON.stringify(encoded)
        if (json === undefined) throw new TypeError('JSON response body cannot encode to undefined')
        return { body: json, formData: false }
      })
    }
    case 'text': {
      return mapSchemaStep(encodeSchemaValue(body.schema, value as never, { location: 'response' }), (encoded) => {
        if (typeof encoded !== 'string') throw new TypeError('Text response body must encode to a string')
        return { body: encoded, formData: false }
      })
    }
    case 'bytes': {
      return mapSchemaStep(encodeSchemaValue(body.schema, value as never, { location: 'response' }), (encoded) => {
        if (!(encoded instanceof Uint8Array)) throw new TypeError('Byte response body must encode to Uint8Array')
        return { body: encoded as BodyInit, formData: false }
      })
    }
    case 'form-data': {
      return mapSchemaStep(encodeSchemaValue(body.schema, value as never, { location: 'response' }), (encoded) => {
        if (!(encoded instanceof FormData)) throw new TypeError('Form data response body must encode to FormData')
        return { body: encoded, formData: true }
      })
    }
    case 'stream': {
      const source = value as StreamSource<unknown>
      if (source === null || (typeof source !== 'object' && typeof source !== 'function')) {
        throw new TypeError('Stream response body must be iterable')
      }
      const wire =
        'schema' in body ? (body.format as StreamFormat<unknown>).encode(encodedStream(source, body.schema)) : source
      return { body: byteStream(wire) as unknown as BodyInit, formData: false }
    }
    case 'raw':
      throw new TypeError('Raw response bodies are serialized directly')
  }
}

async function serializeResponse(value: unknown): Promise<Response> {
  if (!isRecord(value)) {
    throw new ServerRuntimeError('invalid-server-response', 500, 'Server handler did not return a produced response')
  }
  const produced = producedResponses.get(value)
  if (produced === undefined) {
    throw new ServerRuntimeError(
      'invalid-server-response',
      500,
      'Server responses must be created with actions.respond(), actions.error(), or actions.next()'
    )
  }

  const status = value['status'] as number
  const definition = produced.definition
  const body = definition.body
  if (body.kind === 'raw') {
    if (!(value['body'] instanceof Response) || value['body'].status !== status) {
      throw new ServerRuntimeError(
        'invalid-server-response',
        500,
        'Raw server response status must match its declared result status'
      )
    }
    return value['body']
  }

  const headersStep = responseHeaders(definition, value['headers'])
  const bodyStep = serializeResponseBody(definition, value['body'])
  let headers: HeadersInit | undefined
  let serializedBody: SerializedResponseBody
  if (isSchemaStepAsync(headersStep) && isSchemaStepAsync(bodyStep)) {
    ;[headers, serializedBody] = await Promise.all([headersStep, bodyStep])
  } else {
    headers = isSchemaStepAsync(headersStep) ? await headersStep : headersStep
    serializedBody = isSchemaStepAsync(bodyStep) ? await bodyStep : bodyStep
  }
  if (serializedBody.formData) {
    if (headers !== undefined) {
      const resolved = headers instanceof Headers ? headers : new Headers(headers)
      resolved.delete('content-type')
      headers = resolved
    }
  } else if (definition.contentType !== undefined) {
    if (headers === undefined) headers = { 'content-type': definition.contentType }
    else {
      const resolved = headers instanceof Headers ? headers : new Headers(headers)
      resolved.set('content-type', definition.contentType)
      headers = resolved
    }
  }
  return new Response(serializedBody.body, {
    status,
    ...(headers === undefined ? {} : { headers }),
  })
}

async function executeRoute(
  server: RuntimeServer,
  match: MatchedRoute,
  request: Request,
  url: URL | undefined,
  phase: { value: FetchServerPhase }
): Promise<Response> {
  phase.value = 'request'
  const route = match.runtime.compiled.route
  const decodingRequest =
    'body' in route && (server.context !== undefined || match.runtime.middlewares.length > 0)
      ? request.clone()
      : request
  const routeInput = await decodeRouteInput(match, decodingRequest, url)

  phase.value = 'context'
  const context =
    server.context === undefined ? emptyContext : await server.context({ request, route: match.runtime.metadata })
  if (!isRecord(context)) {
    throw new ServerRuntimeError('invalid-context', 500, 'Server context factory must return an object')
  }

  const sharedInput = { context, request, route: match.runtime.metadata }
  const handlerInput = { ...sharedInput, ...routeInput }

  phase.value = 'handler'
  const result =
    match.runtime.middlewares.length === 0
      ? await match.runtime.handler(match.runtime.handlerActions, handlerInput)
      : await dispatchMiddlewares(
          match.runtime.middlewares,
          sharedInput,
          () => match.runtime.handler(match.runtime.handlerActions, handlerInput),
          (next) => ({ next, error: errorProducer(server.contract.errors) }),
          {
            invalidMiddleware: () =>
              new ServerRuntimeError('invalid-server-response', 500, 'Server middleware must be a function'),
            multipleNext: () =>
              new ServerRuntimeError('invalid-server-response', 500, 'Server middleware called next() more than once'),
          }
        )
  phase.value = 'response'
  return serializeResponse(result)
}

/** Creates a runtime-neutral Web Fetch handler from a built server implementation. */
export function createFetchHandler<
  const ContractType extends Contract,
  const Context extends object,
  const Fragments extends readonly unknown[],
>(
  implementation: ServerImplementation<ContractType, Context, Fragments>,
  options: FetchServerOptions = {}
): FetchHandler {
  const server = implementation as unknown as RuntimeServer
  const routes = compileRuntimeRoutes(server)

  return async (request: Request): Promise<Response> => {
    let selectedMetadata: RouteMetadata | undefined
    const phase: { value: FetchServerPhase } = { value: 'routing' }

    try {
      if (!(request instanceof Request)) throw new TypeError('Fetch handler input must be a Request')
      const method = request.method.toUpperCase()
      const selection = selectRoute(routes, requestPathname(request.url), method)
      if (selection.kind === 'miss') {
        if (selection.allowed.length === 0) return simpleProblem(404, 'route-not-found', 'Route not found')
        return simpleProblem(405, 'method-not-allowed', 'Method not allowed', {
          allow: selection.allowed.join(', '),
        })
      }

      selectedMetadata = selection.match.runtime.metadata
      const url = 'query' in selection.match.runtime.compiled.route ? new URL(request.url) : undefined
      return await executeRoute(server, selection.match, request, url, phase)
    } catch (error) {
      const fallback = errorResponse(error, phase.value)
      const replacement = await options.onError?.({
        error,
        phase: phase.value,
        request,
        ...(selectedMetadata === undefined ? {} : { route: selectedMetadata }),
        defaultResponse: fallback.clone(),
      })
      return replacement instanceof Response ? replacement : fallback
    }
  }
}
