import type { CompiledContractRoute } from '../compiler'
import type { Awaitable, RouteMetadata } from '../context'
import type { Contract } from '../contract'
import { isAPIError, toAPIProblem, type APIProblem } from '../errors'
import { dispatchMiddlewares } from '../middleware'
import { hasOwn, isRecord, setOwn } from '../object'
import { mimeEssence, textWireObject, type AnyRequestBody } from '../request'
import {
  compileCanonicalContract,
  type CanonicalContractPlan,
  type CanonicalRequestBodyPlan,
  type CanonicalResponseEntry,
  type CanonicalResponsePlan,
  type CanonicalRoutePlan,
} from '../route-plan'
import type { StreamFormat, StreamSource } from '../stream'
import { isSchemaStepAsync, mapSchemaStep, type SchemaStep } from '../validation'
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

type RuntimeServer = {
  readonly context?: (input: { readonly request: unknown; readonly route: RouteMetadata }) => Awaitable<object>
  readonly contract: Contract
  readonly handlers: unknown
  readonly middlewares: readonly unknown[]
}

type RuntimeHandler = (input: object) => Awaitable<unknown>
type ResponseSerializer = (value: Readonly<Record<string, unknown>>) => Promise<WireServerResponse>
type RuntimeResponseSerializer = (value: unknown) => Promise<WireServerResponse>
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
  readonly metadata: RouteMetadata
  readonly middlewares: readonly unknown[]
  readonly pattern: readonly string[]
  readonly readsBody: boolean
  readonly readsQuery: boolean
  readonly serializeResponse: RuntimeResponseSerializer
}

type RuntimeRoutingNode = {
  parameter?: RuntimeRoutingNode
  readonly routes: RuntimeRoute[]
  readonly static: Map<string, RuntimeRoutingNode>
}

type RuntimeRoutingTable = {
  readonly exact?: Map<string, readonly RuntimeRoute[]>
  root?: RuntimeRoutingNode
  readonly routes: readonly RuntimeRoute[]
  readonly single?: RuntimeRoute
}

type RouteSelection =
  | { readonly kind: 'match'; readonly match: MatchedRoute }
  | { readonly allowed: readonly string[]; readonly kind: 'miss' }

const emptyParameters = {}
const emptyContext = {}
const emptyHeaders = {}

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
  return parameters
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
  const single = table.single
  if (single !== undefined && !pathname.includes('%')) {
    if (pathname !== single.compiled.path) return { kind: 'miss', allowed: [] }
    return method === single.compiled.method
      ? { kind: 'match', match: { runtime: single, parameters: emptyParameters } }
      : { kind: 'miss', allowed: [single.compiled.method] }
  }

  if (!pathname.includes('%')) {
    const exact = table.exact?.get(pathname)
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

function compileRuntimeRoutes(server: RuntimeServer, contractPlan: CanonicalContractPlan): RuntimeRoutingTable {
  const singleStaticRoute =
    contractPlan.routes.length === 1 && contractPlan.routes[0]!.compiled.pathParameters.length === 0
  const exact = singleStaticRoute ? undefined : new Map<string, RuntimeRoute[]>()
  const routes: RuntimeRoute[] = []
  let hasParameters = false

  for (const plan of contractPlan.routes) {
    const compiled = plan.compiled
    const handler = treeValue(server.handlers, compiled.key)
    if (typeof handler !== 'function') {
      throw new ServerRuntimeError(
        'invalid-server-response',
        500,
        'Compiled route is missing its server implementation'
      )
    }

    const runtime = {
      compiled,
      decodeInput: compileRouteInput(plan),
      handler: handler as RuntimeHandler,
      metadata: plan.metadata,
      middlewares: server.middlewares,
      pattern: plan.pattern,
      readsBody: plan.body !== undefined,
      readsQuery: plan.decodeQuery !== undefined,
      serializeResponse: compileResponseDispatcher(
        contractPlan.errors.length === 0 ? plan.responses : [...contractPlan.errors, ...plan.responses]
      ),
    }
    routes.push(runtime)

    if (compiled.pathParameters.length === 0) {
      const candidates = exact?.get(compiled.path)
      if (candidates === undefined) exact?.set(compiled.path, [runtime])
      else candidates.push(runtime)
    } else hasParameters = true
  }

  return {
    ...(exact === undefined ? { single: routes[0]! } : { exact }),
    ...(hasParameters ? { root: compileRoutingTree(routes) } : {}),
    routes,
  }
}

function problemResponse(problem: APIProblem, headers: Readonly<Record<string, string>> = {}): WireServerResponse {
  return {
    status: problem.status,
    headers: { ...headers, 'content-type': 'application/problem+json; charset=utf-8' },
    body: { kind: 'json' as const, value: problem },
  }
}

function simpleProblem(
  status: number,
  code: string,
  title: string,
  headers?: Readonly<Record<string, string>>
): WireServerResponse {
  return problemResponse({ type: 'about:blank', title, status, code }, headers)
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
  plan: CanonicalRequestBodyPlan
): (input: WireServerInput, preserveRequest: boolean) => Promise<unknown> {
  const declaration = plan.declaration
  const decode = plan.schema.decode

  return async (input, preserveRequest) => {
    const provided = input.body
    const contentType = provided?.contentType ?? wireHeaders(input)['content-type'] ?? ''
    const received = mimeEssence(contentType)
    if (received !== plan.expectedContentType) {
      throw new ServerRuntimeError(
        'unsupported-media-type',
        415,
        `Expected request content type ${plan.expectedContentType}, received ${received || 'none'}`,
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

function compileRouteInput(plan: CanonicalRoutePlan): RuntimeInputDecoder {
  const decodeParams = plan.decodePath
  const decodeQuery = plan.decodeQuery
  const decodeHeaders = plan.headers?.decode
  const decodeBody = plan.body === undefined ? undefined : compileBodyDecoder(plan.body)
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
  plan: CanonicalResponsePlan
): (value: unknown) => SchemaStep<Readonly<Record<string, string>> | undefined> {
  const definition = plan.definition
  if (definition.headers === undefined) {
    return (value) => value as Readonly<Record<string, string>> | undefined
  }
  const encode = plan.headers!.encode
  return (value) =>
    mapSchemaStep(encode(value as never), (encodedValue) => {
      const encoded = textWireObject(encodedValue, 'headers')
      const headers: Record<string, string> = {}
      for (const [key, field] of Object.entries(encoded)) {
        if (field !== undefined) headers[key] = field
      }
      return headers
    })
}

type SerializedResponseBody = {
  readonly kind: WireServerResponseBody['kind']
  readonly value: unknown
}

function compileResponseBody(plan: CanonicalResponsePlan): (value: unknown) => SchemaStep<SerializedResponseBody> {
  const definition = plan.definition
  const body = definition.body

  switch (body.kind) {
    case 'empty':
      return () => ({ kind: 'empty', value: undefined })
    case 'json': {
      const encode = plan.body!.encode
      return (value) =>
        mapSchemaStep(encode(value as never), (encoded) => {
          if (encoded === undefined) throw new TypeError('JSON response body cannot encode to undefined')
          return { kind: 'json', value: encoded }
        })
    }
    case 'text': {
      const encode = plan.body!.encode
      return (value) =>
        mapSchemaStep(encode(value as never), (encoded) => {
          if (typeof encoded !== 'string') throw new TypeError('Text response body must encode to a string')
          return { kind: 'text', value: encoded }
        })
    }
    case 'bytes': {
      const encode = plan.body!.encode
      return (value) =>
        mapSchemaStep(encode(value as never), (encoded) => {
          if (!(encoded instanceof Uint8Array)) throw new TypeError('Byte response body must encode to Uint8Array')
          return { kind: 'bytes', value: encoded }
        })
    }
    case 'form-data': {
      const encode = plan.body!.encode
      return (value) =>
        mapSchemaStep(encode(value as never), (encoded) => {
          if (!(encoded instanceof FormData)) throw new TypeError('Form data response body must encode to FormData')
          return { kind: 'form-data', value: encoded }
        })
    }
    case 'stream': {
      const streamEncoder = 'schema' in body ? plan.body!.encode : undefined
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

function compileResponseSerializer(plan: CanonicalResponsePlan, status: number): ResponseSerializer {
  const definition = plan.definition
  const body = definition.body
  if (body.kind === 'raw') {
    return async (value) => {
      return {
        status,
        headers: {},
        body: { kind: 'raw' as const, value: value['body'] },
      }
    }
  }

  const serializeHeaders = compileResponseHeaders(plan)
  const serializeBody = compileResponseBody(plan)
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
      headers: headers ?? {},
      body: serializedBody,
    }
  }
}

function compileResponseDispatcher(entries: readonly CanonicalResponseEntry[]): RuntimeResponseSerializer {
  if (entries.length === 1) {
    const [status, response] = entries[0]!
    const serialize = compileResponseSerializer(response, status)
    return (value) => {
      if (!isRecord(value) || value['status'] !== status) {
        throw new ServerRuntimeError('invalid-server-response', 500, 'Server returned an undeclared response status')
      }
      return serialize(value)
    }
  }

  const serializers = new Map<number, ResponseSerializer>()
  for (const [status, response] of entries) serializers.set(status, compileResponseSerializer(response, status))

  return (value) => {
    const serialize =
      isRecord(value) && typeof value['status'] === 'number' ? serializers.get(value['status']) : undefined
    if (!isRecord(value) || serialize === undefined) {
      throw new ServerRuntimeError('invalid-server-response', 500, 'Server returned an undeclared response status')
    }
    return serialize(value)
  }
}

async function executeRoute(
  server: RuntimeServer,
  match: MatchedRoute,
  request: WireServerInput,
  query: URLSearchParams | undefined,
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
      ? await match.runtime.handler(handlerInput)
      : await dispatchMiddlewares(match.runtime.middlewares, sharedInput, () => match.runtime.handler(handlerInput), {
          invalidMiddleware: () =>
            new ServerRuntimeError('invalid-server-response', 500, 'Server middleware must be a function'),
          multipleNext: () =>
            new ServerRuntimeError('invalid-server-response', 500, 'Server middleware called next() more than once'),
        })
  phase.value = 'response'
  return match.runtime.serializeResponse(result)
}

/** Creates the compiled wire dispatcher used by Fetch and framework adapters. */
export function createWireHandler<const ContractType extends Contract, const Context extends object>(
  implementation: ServerImplementation<ContractType, Context>,
  options: WireServerOptions = {}
): WireServerHandler {
  const server = implementation as unknown as RuntimeServer
  const contractPlan = compileCanonicalContract(server.contract)
  const routes = compileRuntimeRoutes(server, contractPlan)

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
      return await executeRoute(server, selection.match, input, query, phase)
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
