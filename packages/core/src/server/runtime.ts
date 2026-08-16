import { compileContract, type CompiledContractRoute } from '../compiler'
import type { Awaitable, RouteMetadata } from '../context'
import type { Contract } from '../contract'
import { isAPIError, toAPIProblem, type APIProblem } from '../errors'
import { dispatchMiddlewares } from '../middleware'
import { copyRecord, hasOwn, isRecord, setOwn } from '../object'
import { compilePathParameterDecoder } from '../parameters'
import { compileQueryDecoder, type QueryTransportPlan } from '../query'
import { mimeEssence, textWireObject, type AnyRequestBody, type AnyRequestQuery } from '../request'
import type { AnyRouteResponse } from '../response'
import type { StreamFormat, StreamSource } from '../stream'
import { compileSchemaExecution, isSchemaStepAsync, mapSchemaStep, type SchemaStep } from '../validation'
import { ServerRuntimeError } from './errors'
import type { ServerImplementation } from './types'

export type WireServerPhase = 'context' | 'handler' | 'request' | 'response' | 'routing'

export type WireServerResponseBody = {
  readonly kind: 'bytes' | 'empty' | 'form-data' | 'json' | 'raw' | 'stream' | 'text'
  readonly value: unknown
}

export type WireServerResponse = {
  readonly status: number
  readonly headers: Readonly<Record<string, string>>
  readonly body: WireServerResponseBody
}

export type WireServerErrorInput = {
  readonly defaultResponse: WireServerResponse
  readonly error: unknown
  readonly phase: WireServerPhase
  readonly request: unknown
  readonly route?: RouteMetadata
}

export type WireServerOptions = {
  /** Optionally replace the runtime's protocol-safe error response. */
  readonly onError?: (input: WireServerErrorInput) => Awaitable<WireServerResponse | undefined | void>
}

export type WireServerBody = {
  /** The already-extracted wire value: parsed JSON, text, bytes, or FormData. */
  readonly value: unknown
  /** Defaults to the content-type header on `request`. */
  readonly contentType?: string
}

export type WireServerInput = {
  /** Original host request exposed to context, middleware, and handlers. */
  readonly request: unknown
  readonly method: string
  readonly pathname: string
  readonly headers?: Readonly<Record<string, string>>
  /** Lazily extracts headers when the matched route declares headers or a body. */
  readonly readHeaders?: () => Readonly<Record<string, string>>
  readonly query?: URLSearchParams
  readonly body?: WireServerBody
  readonly readBody?: (representation: AnyRequestBody['representation'], preserveRequest: boolean) => Promise<unknown>
}

export type WireServerHandler = (input: WireServerInput) => Promise<WireServerResponse>

type MatchedRoute = {
  readonly runtime: RuntimeRoute
  readonly parameters: Readonly<Record<string, string>>
}

type ProducedResponseMetadata = {
  readonly serialize: ResponseSerializer
}

type RuntimeServer = {
  readonly context?: (input: { readonly request: unknown; readonly route: RouteMetadata }) => Awaitable<object>
  readonly contract: Contract
  readonly handlers: unknown
  readonly middlewares: unknown
}

type RuntimeHandler = (actions: object, input: object) => Awaitable<unknown>
type ResponseSerializer = (value: Readonly<Record<string, unknown>>) => Promise<WireServerResponse>
type RuntimeInputDecoder = (
  parameters: Readonly<Record<string, string>>,
  input: WireServerInput,
  query: URLSearchParams | undefined,
  preserveRequest: boolean
) => Promise<Record<string, unknown>>

type RuntimeRoute = {
  readonly compiled: CompiledContractRoute
  readonly decodeInput: RuntimeInputDecoder
  readonly handler: RuntimeHandler
  readonly handlerActions: Readonly<{ readonly respond: (value: unknown) => unknown }>
  readonly metadata: RouteMetadata
  readonly middlewares: readonly unknown[]
  readonly pattern: readonly string[]
  readonly readsBody: boolean
  readonly readsQuery: boolean
}

type RuntimeRoutingNode = {
  parameter?: RuntimeRoutingNode
  readonly routes: RuntimeRoute[]
  readonly static: Map<string, RuntimeRoutingNode>
}

type RuntimeRoutingTable = {
  readonly exact: Map<string, readonly RuntimeRoute[]>
  root?: RuntimeRoutingNode
  readonly routes: readonly RuntimeRoute[]
}

type RouteSelection =
  | { readonly kind: 'match'; readonly match: MatchedRoute }
  | { readonly allowed: readonly string[]; readonly kind: 'miss' }

const emptyParameters = Object.freeze({})
const emptyContext = Object.freeze({})
const emptyHeaders = Object.freeze({})
const producedResponses = new WeakMap<object, ProducedResponseMetadata>()

function wireHeaders(input: WireServerInput): Readonly<Record<string, string>> {
  return input.headers ?? input.readHeaders?.() ?? emptyHeaders
}

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

  if (table.root === undefined) {
    if (!pathname.includes('%')) return { kind: 'miss', allowed: [] }
    table.root = compileRoutingTree(table.routes)
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

function compileRoutingTree(routes: readonly RuntimeRoute[]): RuntimeRoutingNode {
  const root = routingNode()
  for (const runtime of routes) {
    let node = root
    for (const segment of runtime.pattern) {
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

  return root
}

function compileRuntimeRoutes(server: RuntimeServer): RuntimeRoutingTable {
  const exact = new Map<string, RuntimeRoute[]>()
  const routes: RuntimeRoute[] = []
  let hasParameters = false

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

    const runtime = {
      compiled,
      decodeInput: compileRouteInput(compiled),
      handler: handler as RuntimeHandler,
      handlerActions: Object.freeze({ respond: responseProducer(compiled.route.responses) }),
      metadata: Object.freeze({ key: compiled.key, method: compiled.method, path: compiled.path }),
      middlewares,
      pattern: pathSegments(compiled.path),
      readsBody: 'body' in compiled.route,
      readsQuery: 'query' in compiled.route,
    }
    routes.push(runtime)

    if (compiled.pathParameters.length === 0) {
      const candidates = exact.get(compiled.path)
      if (candidates === undefined) exact.set(compiled.path, [runtime])
      else candidates.push(runtime)
    } else hasParameters = true
  }

  return { exact, ...(hasParameters ? { root: compileRoutingTree(routes) } : {}), routes }
}

function problemResponse(problem: APIProblem, headers: Readonly<Record<string, string>> = {}): WireServerResponse {
  return Object.freeze({
    status: problem.status,
    headers: Object.freeze({ ...headers, 'content-type': 'application/problem+json; charset=utf-8' }),
    body: Object.freeze({ kind: 'json' as const, value: problem }),
  })
}

function simpleProblem(
  status: number,
  code: string,
  title: string,
  headers?: Readonly<Record<string, string>>
): WireServerResponse {
  return problemResponse(Object.freeze({ type: 'about:blank', title, status, code }), headers)
}

function errorResponse(error: unknown, phase: WireServerPhase): WireServerResponse {
  if (phase === 'request' || phase === 'routing') {
    if (error instanceof ServerRuntimeError) {
      return problemResponse(toAPIProblem(error, { status: error.status, title: error.message }))
    }
    if (isAPIError(error)) return problemResponse(toAPIProblem(error, { status: 400, title: 'Invalid request' }))
  }

  return simpleProblem(500, 'internal-server-error', 'Internal server error')
}

function compileBodyDecoder(
  declaration: AnyRequestBody
): (input: WireServerInput, preserveRequest: boolean) => Promise<unknown> {
  const expected = mimeEssence(declaration.contentType)
  const decode = compileSchemaExecution(declaration.schema, { location: 'body' }).decode

  return async (input, preserveRequest) => {
    const provided = input.body
    const contentType = provided?.contentType ?? wireHeaders(input)['content-type'] ?? ''
    const received = mimeEssence(contentType)
    if (received !== expected) {
      throw new ServerRuntimeError(
        'unsupported-media-type',
        415,
        `Expected request content type ${expected}, received ${received || 'none'}`,
        { location: 'body' }
      )
    }

    let wire: unknown
    try {
      if (provided !== undefined) wire = provided.value
      else if (input.readBody !== undefined) wire = await input.readBody(declaration.representation, preserveRequest)
      else throw new TypeError('Wire server input does not provide a request body reader')
    } catch (cause) {
      throw new ServerRuntimeError('invalid-request-body', 400, 'Request body could not be decoded', {
        cause,
        location: 'body',
      })
    }
    return decode(wire)
  }
}

function compileRouteInput(compiled: CompiledContractRoute): RuntimeInputDecoder {
  const route = compiled.route
  const decodeParams =
    compiled.pathParameters.length === 0 ? undefined : compilePathParameterDecoder(compiled.pathParameters)
  const decodeQuery =
    'query' in route
      ? compileQueryDecoder(route.query as AnyRequestQuery & { readonly transport: QueryTransportPlan })
      : undefined
  const decodeHeaders =
    'headers' in route ? compileSchemaExecution(route.headers, { location: 'headers' }).decode : undefined
  const decodeBody = 'body' in route ? compileBodyDecoder(route.body) : undefined
  const fieldCount =
    Number(decodeParams !== undefined) +
    Number(decodeQuery !== undefined) +
    Number(decodeHeaders !== undefined) +
    Number(decodeBody !== undefined)

  if (fieldCount === 0) return async () => ({})

  return async (parameters, request, query, preserveRequest) => {
    const input: Record<string, unknown> = {}
    if (fieldCount === 1) {
      if (decodeParams !== undefined) input['params'] = await decodeParams(parameters)
      else if (decodeQuery !== undefined) input['query'] = await decodeQuery(query ?? new URLSearchParams())
      else if (decodeHeaders !== undefined) {
        input['headers'] = await decodeHeaders(wireHeaders(request))
      } else input['body'] = await decodeBody!(request, preserveRequest)
      return input
    }

    const [params, queryValue, headers, bodyValue] = await Promise.all([
      decodeParams?.(parameters),
      decodeQuery?.(query ?? new URLSearchParams()),
      decodeHeaders?.(wireHeaders(request)),
      decodeBody?.(request, preserveRequest),
    ])
    if (decodeParams !== undefined) input['params'] = params
    if (decodeQuery !== undefined) input['query'] = queryValue
    if (decodeHeaders !== undefined) input['headers'] = headers
    if (decodeBody !== undefined) input['body'] = bodyValue
    return input
  }
}

function responseProducer(responses: Readonly<Record<number, AnyRouteResponse>>) {
  const entries = Object.entries(responses)
  if (entries.length === 1) {
    const [statusKey, definition] = entries[0]!
    const status = Number(statusKey)
    const serialize = compileResponseSerializer(definition, status)
    return (value: unknown): unknown => {
      if (!isRecord(value) || value['status'] !== status) {
        throw new ServerRuntimeError(
          'invalid-server-response',
          500,
          'Server response must use a status declared by the selected responder'
        )
      }

      const produced = copyRecord(value)
      producedResponses.set(produced, { serialize })
      return produced
    }
  }

  const serializers = new Map<number, ResponseSerializer>()
  for (const [status, definition] of entries)
    serializers.set(Number(status), compileResponseSerializer(definition, Number(status)))

  return (value: unknown): unknown => {
    const serialize =
      isRecord(value) && typeof value['status'] === 'number' ? serializers.get(value['status']) : undefined
    if (!isRecord(value) || serialize === undefined) {
      throw new ServerRuntimeError(
        'invalid-server-response',
        500,
        'Server response must use a status declared by the selected responder'
      )
    }

    const produced = copyRecord(value)
    producedResponses.set(produced, { serialize })
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

async function* encodedStream(
  source: StreamSource<unknown>,
  encode: (value: never) => SchemaStep<unknown>
): AsyncIterable<unknown> {
  for await (const value of source) yield await encode(value as never)
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

function compileResponseHeaders(
  definition: AnyRouteResponse
): (value: unknown) => SchemaStep<Readonly<Record<string, string>> | undefined> {
  if (definition.headers === undefined) {
    return (value) => value as Readonly<Record<string, string>> | undefined
  }
  const encode = compileSchemaExecution(definition.headers, { location: 'headers' }).encode
  return (value) =>
    mapSchemaStep(encode(value as never), (encodedValue) => {
      const encoded = textWireObject(encodedValue, 'headers')
      const headers: Record<string, string> = {}
      for (const [key, field] of Object.entries(encoded)) {
        if (field !== undefined) headers[key] = field
      }
      return Object.freeze(headers)
    })
}

type SerializedResponseBody = {
  readonly kind: WireServerResponseBody['kind']
  readonly value: unknown
}

function compileResponseBody(definition: AnyRouteResponse): (value: unknown) => SchemaStep<SerializedResponseBody> {
  const body = definition.body

  switch (body.kind) {
    case 'empty':
      return () => ({ kind: 'empty', value: undefined })
    case 'json': {
      const encode = compileSchemaExecution(body.schema, { location: 'response' }).encode
      return (value) =>
        mapSchemaStep(encode(value as never), (encoded) => {
          if (encoded === undefined) throw new TypeError('JSON response body cannot encode to undefined')
          return { kind: 'json', value: encoded }
        })
    }
    case 'text': {
      const encode = compileSchemaExecution(body.schema, { location: 'response' }).encode
      return (value) =>
        mapSchemaStep(encode(value as never), (encoded) => {
          if (typeof encoded !== 'string') throw new TypeError('Text response body must encode to a string')
          return { kind: 'text', value: encoded }
        })
    }
    case 'bytes': {
      const encode = compileSchemaExecution(body.schema, { location: 'response' }).encode
      return (value) =>
        mapSchemaStep(encode(value as never), (encoded) => {
          if (!(encoded instanceof Uint8Array)) throw new TypeError('Byte response body must encode to Uint8Array')
          return { kind: 'bytes', value: encoded }
        })
    }
    case 'form-data': {
      const encode = compileSchemaExecution(body.schema, { location: 'response' }).encode
      return (value) =>
        mapSchemaStep(encode(value as never), (encoded) => {
          if (!(encoded instanceof FormData)) throw new TypeError('Form data response body must encode to FormData')
          return { kind: 'form-data', value: encoded }
        })
    }
    case 'stream': {
      const streamEncoder =
        'schema' in body ? compileSchemaExecution(body.schema, { location: 'response' }).encode : undefined
      const format = 'format' in body ? (body.format as StreamFormat<unknown>) : undefined
      return (value) => {
        const source = value as StreamSource<unknown>
        if (source === null || (typeof source !== 'object' && typeof source !== 'function')) {
          throw new TypeError('Stream response body must be iterable')
        }
        const wire =
          streamEncoder === undefined || format === undefined
            ? source
            : format.encode(encodedStream(source, streamEncoder))
        return { kind: 'stream', value: byteStream(wire) }
      }
    }
    case 'raw':
      return () => {
        throw new TypeError('Raw response bodies are serialized directly')
      }
  }
}

function compileResponseSerializer(definition: AnyRouteResponse, status: number): ResponseSerializer {
  const body = definition.body
  if (body.kind === 'raw') {
    return async (value) => {
      return {
        status,
        headers: Object.freeze({}),
        body: Object.freeze({ kind: 'raw' as const, value: value['body'] }),
      }
    }
  }

  const serializeHeaders = compileResponseHeaders(definition)
  const serializeBody = compileResponseBody(definition)
  const contentType = definition.contentType
  return async (value) => {
    const headersStep = serializeHeaders(value['headers'])
    const bodyStep = serializeBody(value['body'])
    let headers: Readonly<Record<string, string>> | undefined
    let serializedBody: SerializedResponseBody
    if (isSchemaStepAsync(headersStep) && isSchemaStepAsync(bodyStep)) {
      ;[headers, serializedBody] = await Promise.all([headersStep, bodyStep])
    } else {
      headers = isSchemaStepAsync(headersStep) ? await headersStep : headersStep
      serializedBody = isSchemaStepAsync(bodyStep) ? await bodyStep : bodyStep
    }
    if (serializedBody.kind === 'form-data') {
      if (headers !== undefined && 'content-type' in headers) {
        const { ['content-type']: _contentType, ...remaining } = headers
        headers = remaining
      }
    } else if (contentType !== undefined) {
      if (headers === undefined) headers = { 'content-type': contentType }
      else headers = { ...headers, 'content-type': contentType }
    }
    return {
      status,
      headers: Object.freeze(headers ?? {}),
      body: Object.freeze(serializedBody),
    }
  }
}

function serializeResponse(value: unknown): Promise<WireServerResponse> {
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
  return produced.serialize(value)
}

async function executeRoute(
  server: RuntimeServer,
  match: MatchedRoute,
  request: WireServerInput,
  query: URLSearchParams | undefined,
  error: (status: number, value: unknown) => unknown,
  phase: { value: WireServerPhase }
): Promise<WireServerResponse> {
  phase.value = 'request'
  const preserveRequest =
    match.runtime.readsBody &&
    request.body === undefined &&
    (server.context !== undefined || match.runtime.middlewares.length > 0)
  const routeInput = await match.runtime.decodeInput(match.parameters, request, query, preserveRequest)

  phase.value = 'context'
  const context =
    server.context === undefined
      ? emptyContext
      : await server.context({ request: request.request, route: match.runtime.metadata })
  if (!isRecord(context)) {
    throw new ServerRuntimeError('invalid-context', 500, 'Server context factory must return an object')
  }

  const sharedInput = { context, request: request.request, route: match.runtime.metadata }
  const handlerInput = { ...sharedInput, ...routeInput }

  phase.value = 'handler'
  const result =
    match.runtime.middlewares.length === 0
      ? await match.runtime.handler(match.runtime.handlerActions, handlerInput)
      : await dispatchMiddlewares(
          match.runtime.middlewares,
          sharedInput,
          () => match.runtime.handler(match.runtime.handlerActions, handlerInput),
          (next) => ({ next, error }),
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

/** Creates the compiled wire dispatcher used by Fetch and framework adapters. */
export function createWireHandler<
  const ContractType extends Contract,
  const Context extends object,
  const Fragments extends readonly unknown[],
>(
  implementation: ServerImplementation<ContractType, Context, Fragments>,
  options: WireServerOptions = {}
): WireServerHandler {
  const server = implementation as unknown as RuntimeServer
  const routes = compileRuntimeRoutes(server)
  const error = errorProducer(server.contract.errors)

  return async (input: WireServerInput): Promise<WireServerResponse> => {
    const request = input.request
    let selectedMetadata: RouteMetadata | undefined
    const phase: { value: WireServerPhase } = { value: 'routing' }

    try {
      if (typeof input.method !== 'string' || typeof input.pathname !== 'string') {
        throw new TypeError('Wire server input must provide a method and pathname')
      }
      const selection = selectRoute(routes, input.pathname, input.method.toUpperCase())
      if (selection.kind === 'miss') {
        if (selection.allowed.length === 0) return simpleProblem(404, 'route-not-found', 'Route not found')
        return simpleProblem(405, 'method-not-allowed', 'Method not allowed', {
          allow: selection.allowed.join(', '),
        })
      }

      selectedMetadata = selection.match.runtime.metadata
      const query = selection.match.runtime.readsQuery ? (input.query ?? new URLSearchParams()) : undefined
      return await executeRoute(server, selection.match, input, query, error, phase)
    } catch (error) {
      const fallback = errorResponse(error, phase.value)
      const replacement = await options.onError?.({
        error,
        phase: phase.value,
        request,
        ...(selectedMetadata === undefined ? {} : { route: selectedMetadata }),
        defaultResponse: fallback,
      })
      return replacement ?? fallback
    }
  }
}
