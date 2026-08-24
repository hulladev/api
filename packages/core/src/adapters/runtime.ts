import type { CompiledContractRoute } from '../compiler'
import { getCompositionState } from '../composition'
import type { Awaitable, RouteMetadata } from '../context'
import type { Contract } from '../contract'
import { isDeclaredError, type AnyErrorDeclaration, type DeclaredError } from '../declared-errors'
import { isAPIError, toAPIProblem, type APIProblem } from '../errors'
import { dispatchMiddlewareSteps } from '../middleware'
import { isRecord, setOwn } from '../object'
import type { QuerySource } from '../query'
import { mimeEssence, textWireObject, type AnyRequestBody } from '../request'
import {
  compileCanonicalContract,
  type CanonicalContractPlan,
  type CanonicalErrorDeclarationPlan,
  type CanonicalRequestBodyPlan,
  type CanonicalResponseEntry,
  type CanonicalResponsePlan,
  type CanonicalRoutePlan,
} from '../route-plan'
import type { ServerAdapter } from '../server/adapter'
import { ServerRuntimeError } from '../server/errors'
import type { ServerHandlerBinding } from '../server/implementation'
import type { ServerMiddleware } from '../server/middleware'
import { createServerResponse } from '../server/response'
import type { ServerExecutable } from '../server/types'
import type { StreamFormat, StreamSource } from '../stream'
import { isSchemaStepAsync, mapSchemaStep, type SchemaStep } from '../validation'

export type AdapterPhase = 'context' | 'handler' | 'request' | 'response' | 'routing'

export type AdapterResponseBody = {
  readonly kind: 'bytes' | 'empty' | 'form-data' | 'json' | 'raw' | 'stream' | 'text'
  readonly value: unknown
}

export type AdapterResponse = {
  readonly status: number
  readonly headers: Readonly<Record<string, string>>
  readonly body: AdapterResponseBody
}

export type AdapterErrorInput = {
  readonly defaultResponse: AdapterResponse
  readonly error: unknown
  /** Adapter-specific invocation state forwarded only to adapter error hooks. */
  readonly hostContext?: unknown
  readonly phase: AdapterPhase
  /** The adapter's native request or event value. */
  readonly request: unknown
  readonly route?: RouteMetadata
}

export type AdapterRuntimeOptions = {
  /** Optionally replace the runtime's protocol-safe error response. */
  readonly onError?: (input: AdapterErrorInput) => Awaitable<AdapterResponse | undefined | void>
}

export type AdapterBody = {
  /** The already-extracted wire value: parsed JSON, text, bytes, or FormData. */
  readonly value: unknown
  /** Defaults to the adapter-supplied content-type header. */
  readonly contentType?: string
}

export type AdapterRouteInput = {
  /** The adapter's native request or event value, forwarded only to adapter error hooks. */
  readonly request: unknown
  /** Adapter-specific invocation state forwarded only to adapter error hooks. */
  readonly hostContext?: unknown
  /** Adapter-specific values made available to an adapter context helper. */
  readonly contextInput?: Readonly<Record<string, unknown>>
  /** Parameters extracted by the host router or by the shared adapter matcher. */
  readonly params?: Readonly<Record<string, string>>
  readonly headers?: Readonly<Record<string, string>>
  /** Lazily extracts headers when the matched route declares headers or a body. */
  readonly readHeaders?: () => Readonly<Record<string, string>>
  readonly query?: QuerySource
  readonly body?: AdapterBody
  /** Lazily extracts a body, preserving the native request when context may consume it. */
  readonly readBody?: (representation: AnyRequestBody['representation'], preserveRequest: boolean) => Promise<unknown>
}

export type AdapterDispatchInput = Omit<AdapterRouteInput, 'params'> & {
  readonly method: string
  readonly pathname: string
}

export type AdapterRoute = Pick<CompiledContractRoute, 'key' | 'method' | 'path'> & {
  /** Executes this already-selected route without performing another route match. */
  readonly execute: (input: AdapterRouteInput) => Promise<AdapterResponse>
}

export type AdapterRuntime = {
  /** Compiled routes selected by the implementation or fragment, in declaration order. */
  readonly routes: readonly AdapterRoute[]
}

export type AdapterHandler = (input: AdapterDispatchInput) => Promise<AdapterResponse>

type MatchedRoute = {
  readonly runtime: RuntimeRoute
  readonly parameters: Readonly<Record<string, string>>
}

type RuntimeServer = {
  readonly context?: (input: { readonly route: RouteMetadata } & Readonly<Record<string, unknown>>) => Awaitable<object>
  readonly contract: Contract
}

type RuntimeHandler = (input: object) => Awaitable<unknown>
type ResponseSerializer = (value: Readonly<Record<string, unknown>>) => SchemaStep<AdapterResponse>
type RuntimeResponseSerializer = (value: unknown) => SchemaStep<AdapterResponse>
type RuntimeInputDecoder = (
  parameters: Readonly<Record<string, string>>,
  input: AdapterRouteInput,
  query: QuerySource | undefined
) => SchemaStep<Record<string, unknown>>

type RuntimeRoute = {
  readonly compiled: CompiledContractRoute
  readonly decodeInput?: RuntimeInputDecoder
  readonly handler: RuntimeHandler
  readonly hasInput: boolean
  readonly metadata: RouteMetadata
  readonly middlewares: readonly ServerMiddleware<object, Contract>[]
  readonly pattern: readonly string[]
  readonly readsQuery: boolean
  readonly errors?: RuntimeErrors
  readonly serializeResponse: RuntimeResponseSerializer
}

type DeclaredErrorSerializer = (error: DeclaredError<string, unknown>) => SchemaStep<AdapterResponse>

type RuntimeErrors = {
  readonly factories: Readonly<Record<string, AnyErrorDeclaration>>
  readonly serializers: ReadonlyMap<AnyErrorDeclaration, DeclaredErrorSerializer>
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
const emptyQuery = {}
const emptyRouteInput = {}

function wireHeaders(input: AdapterRouteInput): Readonly<Record<string, string>> {
  return input.headers ?? input.readHeaders?.() ?? emptyHeaders
}

function pathSegments(path: string): readonly string[] {
  if (path === '' || path === '/') return []
  return path.startsWith('/') ? path.slice(1).split('/') : path.split('/')
}

function decodePathname(pathname: string, encoded: boolean): readonly string[] {
  const segments = pathSegments(pathname)
  if (!encoded) return segments
  try {
    return segments.map((segment) => decodeURIComponent(segment))
  } catch (cause) {
    throw new ServerRuntimeError('invalid-path-encoding', 400, 'Request path contains invalid percent encoding', {
      cause,
      location: 'params',
    })
  }
}

function matchingRoutingNode(
  node: RuntimeRoutingNode,
  segments: readonly string[],
  index: number
): RuntimeRoutingNode | undefined {
  if (index === segments.length) return node.routes.length === 0 ? undefined : node

  const segment = segments[index]!
  const staticNode = node.static.get(segment)
  const match = staticNode === undefined ? undefined : matchingRoutingNode(staticNode, segments, index + 1)
  return match ?? (node.parameter === undefined ? undefined : matchingRoutingNode(node.parameter, segments, index + 1))
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

function selectCandidates(
  candidates: readonly RuntimeRoute[],
  method: string,
  segments?: readonly string[]
): RouteSelection {
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
  }
  return { kind: 'miss', allowed: [...new Set(candidates.map((runtime) => runtime.compiled.method))] }
}

function selectRoute(table: RuntimeRoutingTable, pathname: string, method: string): RouteSelection {
  const encoded = pathname.includes('%')
  const single = table.single
  if (single !== undefined && !encoded) {
    if (pathname !== single.compiled.path) return { kind: 'miss', allowed: [] }
    return method === single.compiled.method
      ? { kind: 'match', match: { runtime: single, parameters: emptyParameters } }
      : { kind: 'miss', allowed: [single.compiled.method] }
  }

  if (!encoded) {
    const exact = table.exact?.get(pathname)
    if (exact !== undefined) return selectCandidates(exact, method)
  }

  if (table.root === undefined) {
    if (!encoded) return { kind: 'miss', allowed: [] }
    table.root = compileRoutingTree(table.routes)
  }
  const segments = decodePathname(pathname, encoded)
  const node = matchingRoutingNode(table.root, segments, 0)
  return node === undefined ? { kind: 'miss', allowed: [] } : selectCandidates(node.routes, method, segments)
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

function compileRuntimeRoutes(
  contractPlan: CanonicalContractPlan,
  registeredBindings: readonly ServerHandlerBinding[],
  preserveRequest: boolean
): readonly RuntimeRoute[] {
  const routes: RuntimeRoute[] = []
  const errors = compileRuntimeErrors(contractPlan)
  for (let index = 0; index < contractPlan.routes.length; index++) {
    const plan = contractPlan.routes[index]!
    const compiled = plan.compiled
    const binding = registeredBindings[index]!

    const runtime = {
      compiled,
      ...(plan.hasInput ? { decodeInput: compileRouteInput(plan, preserveRequest) } : {}),
      handler: binding.handler as RuntimeHandler,
      hasInput: plan.hasInput,
      metadata: plan.metadata,
      middlewares: binding.middlewares as readonly ServerMiddleware<object, Contract>[],
      pattern: plan.pattern,
      readsQuery: plan.decodeQuery !== undefined,
      ...(errors === undefined ? {} : { errors }),
      serializeResponse: compileResponseDispatcher(plan.responses),
    }
    routes.push(runtime)
  }

  return routes
}

function compileDeclaredErrorSerializer(status: number, plan: CanonicalErrorDeclarationPlan): DeclaredErrorSerializer {
  const data = plan.data
  const finalize = (error: DeclaredError<string, unknown>, encodedData?: unknown): AdapterResponse => ({
    status,
    headers: { 'content-type': 'application/json' },
    body: {
      kind: 'json',
      value: {
        code: error.code,
        message: error.message,
        ...(data === undefined ? {} : { data: encodedData }),
      },
    },
  })
  if (data === undefined) return (error) => finalize(error)
  return (error) => {
    const encoded =
      data.encode === undefined ? mapSchemaStep(data.decode(error.data), () => error.data) : data.encode(error.data)
    return mapSchemaStep(encoded, (value) => finalize(error, value))
  }
}

function compileRuntimeErrors(plan: CanonicalContractPlan): RuntimeErrors | undefined {
  if (plan.errors.length === 0) return undefined
  const serializers = new Map<AnyErrorDeclaration, DeclaredErrorSerializer>()
  for (const [status, declarations] of plan.errors) {
    for (const declaration of declarations) {
      serializers.set(declaration.declaration, compileDeclaredErrorSerializer(status, declaration))
    }
  }
  return { factories: plan.errorFactories, serializers }
}

function serializeDeclaredError(
  errors: RuntimeErrors,
  error: DeclaredError<string, unknown>
): SchemaStep<AdapterResponse> {
  const serialize = errors.serializers.get(error.declaration)
  if (serialize === undefined) {
    throw new ServerRuntimeError('invalid-server-response', 500, `Undeclared error ${error.code}`)
  }
  return serialize(error)
}

function compileRoutingTable(routes: readonly RuntimeRoute[]): RuntimeRoutingTable {
  const hasParameters = routes.some((runtime) => runtime.compiled.pathParameters.length > 0)

  const singleStaticRoute = routes.length === 1 && routes[0]!.compiled.pathParameters.length === 0
  const exact = singleStaticRoute ? undefined : new Map<string, RuntimeRoute[]>()
  if (exact !== undefined) {
    for (const runtime of routes) {
      if (runtime.compiled.pathParameters.length > 0) continue
      const candidates = exact.get(runtime.compiled.path)
      if (candidates === undefined) exact.set(runtime.compiled.path, [runtime])
      else candidates.push(runtime)
    }
  }

  return {
    ...(exact === undefined ? { single: routes[0]! } : { exact }),
    ...(hasParameters ? { root: compileRoutingTree(routes) } : {}),
    routes,
  }
}

function problemResponse(problem: APIProblem, headers: Readonly<Record<string, string>> = {}): AdapterResponse {
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
): AdapterResponse {
  return problemResponse({ type: 'about:blank', title, status, code }, headers)
}

function errorResponse(error: unknown, phase: AdapterPhase): AdapterResponse {
  if (phase === 'request' || phase === 'routing') {
    if (error instanceof ServerRuntimeError) {
      return problemResponse(toAPIProblem(error, { status: error.status, title: error.message }))
    }
    if (isAPIError(error)) return problemResponse(toAPIProblem(error, { status: 400, title: 'Invalid request' }))
  }

  return simpleProblem(500, 'internal-server-error', 'Internal server error')
}

function compileBodyDecoder(
  plan: CanonicalRequestBodyPlan,
  preserveRequest: boolean
): (input: AdapterRouteInput) => SchemaStep<unknown> {
  const declaration = plan.declaration
  const decode = plan.schema.decode
  const readError = (cause: unknown) =>
    new ServerRuntimeError('invalid-request-body', 400, 'Request body could not be decoded', {
      cause,
      location: 'body',
    })

  return (input) => {
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

    if (provided !== undefined) return decode(provided.value)
    if (input.readBody === undefined) throw new TypeError('No request body reader')

    let wire: Promise<unknown>
    try {
      wire = input.readBody(declaration.representation, preserveRequest)
    } catch (cause) {
      throw readError(cause)
    }
    return wire.then(decode, (cause) => {
      throw readError(cause)
    })
  }
}

function compileRouteInput(plan: CanonicalRoutePlan, preserveRequest: boolean): RuntimeInputDecoder {
  const decodeParams = plan.decodePath
  const decodeQuery = plan.decodeQuery
  const decodeHeaders = plan.headers?.decode
  const decodeBody = plan.body === undefined ? undefined : compileBodyDecoder(plan.body, preserveRequest)
  const fieldCount =
    Number(decodeParams !== undefined) +
    Number(decodeQuery !== undefined) +
    Number(decodeHeaders !== undefined) +
    Number(decodeBody !== undefined)

  if (fieldCount === 1) {
    if (decodeParams !== undefined) {
      return (parameters) => mapSchemaStep(decodeParams(parameters), (params) => ({ params }))
    }
    if (decodeQuery !== undefined) {
      return (_parameters, _request, query) =>
        mapSchemaStep(decodeQuery(query ?? emptyQuery), (queryValue) => ({ query: queryValue }))
    }
    if (decodeHeaders !== undefined) {
      return (_parameters, request) => mapSchemaStep(decodeHeaders(wireHeaders(request)), (headers) => ({ headers }))
    }
    return (_parameters, request) => mapSchemaStep(decodeBody!(request), (body) => ({ body }))
  }

  return (parameters, request, query) => {
    const values = [
      decodeParams?.(parameters),
      decodeQuery?.(query ?? emptyQuery),
      decodeHeaders?.(wireHeaders(request)),
      decodeBody?.(request),
    ] as const
    const resolved = values.some(isSchemaStepAsync) ? Promise.all(values) : values
    return mapSchemaStep(resolved, ([params, queryValue, headers, bodyValue]) => {
      const input: Record<string, unknown> = {}
      if (decodeParams !== undefined) input['params'] = params
      if (decodeQuery !== undefined) input['query'] = queryValue
      if (decodeHeaders !== undefined) input['headers'] = headers
      if (decodeBody !== undefined) input['body'] = bodyValue
      return input
    })
  }
}

async function* encodedStream(
  source: StreamSource<unknown>,
  schema: {
    readonly decode: (value: unknown) => SchemaStep<unknown>
    readonly encode?: (value: unknown) => SchemaStep<unknown>
  }
): AsyncIterable<unknown> {
  for await (const value of source) {
    if (schema.encode === undefined) {
      await schema.decode(value)
      yield value
    } else yield await schema.encode(value)
  }
}

function compileResponseHeaders(
  plan: CanonicalResponsePlan
): (value: unknown) => SchemaStep<Readonly<Record<string, string>> | undefined> {
  const definition = plan.definition
  if (definition.headers === undefined) {
    return (value) => value as Readonly<Record<string, string>> | undefined
  }
  const schema = plan.headers!
  return (value) => {
    const wire = schema.encode === undefined ? mapSchemaStep(schema.decode(value), () => value) : schema.encode(value)
    return mapSchemaStep(wire, (wireValue) => {
      const encoded = textWireObject(wireValue, 'headers')
      const headers: Record<string, string> = {}
      for (const [key, field] of Object.entries(encoded)) {
        if (field !== undefined) setOwn(headers, key, field)
      }
      return headers
    })
  }
}

type SerializedResponseBody = {
  readonly kind: AdapterResponseBody['kind']
  readonly value: unknown
}

function compileResponseBody(plan: CanonicalResponsePlan): (value: unknown) => SchemaStep<SerializedResponseBody> {
  const definition = plan.definition
  const body = definition.body

  switch (body.kind) {
    case 'empty':
      return () => ({ kind: 'empty', value: undefined })
    case 'json': {
      const schema = plan.body!
      return (value) => {
        const wire =
          schema.encode === undefined ? mapSchemaStep(schema.decode(value), () => value) : schema.encode(value)
        return mapSchemaStep(wire, (wireValue) => {
          if (wireValue === undefined) throw new TypeError('JSON response body cannot encode to undefined')
          return { kind: 'json', value: wireValue }
        })
      }
    }
    case 'text': {
      const schema = plan.body!
      return (value) => {
        const wire =
          schema.encode === undefined ? mapSchemaStep(schema.decode(value), () => value) : schema.encode(value)
        return mapSchemaStep(wire, (wireValue) => {
          if (typeof wireValue !== 'string') throw new TypeError('Text response body must encode to a string')
          return { kind: 'text', value: wireValue }
        })
      }
    }
    case 'bytes': {
      const schema = plan.body!
      return (value) => {
        const wire =
          schema.encode === undefined ? mapSchemaStep(schema.decode(value), () => value) : schema.encode(value)
        return mapSchemaStep(wire, (wireValue) => {
          if (!(wireValue instanceof Uint8Array)) throw new TypeError('Byte response body must encode to Uint8Array')
          return { kind: 'bytes', value: wireValue }
        })
      }
    }
    case 'form-data': {
      const schema = plan.body!
      return (value) => {
        const wire =
          schema.encode === undefined ? mapSchemaStep(schema.decode(value), () => value) : schema.encode(value)
        return mapSchemaStep(wire, (wireValue) => {
          if (!(wireValue instanceof FormData)) throw new TypeError('Form data response body must encode to FormData')
          return { kind: 'form-data', value: wireValue }
        })
      }
    }
    case 'stream': {
      const streamSchema = 'schema' in body ? plan.body! : undefined
      const format = 'format' in body ? (body.format as StreamFormat<unknown>) : undefined
      return (value) => {
        const source = value as StreamSource<unknown>
        const candidate = source as {
          readonly [Symbol.asyncIterator]?: unknown
          readonly [Symbol.iterator]?: unknown
        }
        if (
          source === null ||
          (typeof source !== 'object' && typeof source !== 'function') ||
          (typeof candidate[Symbol.asyncIterator] !== 'function' && typeof candidate[Symbol.iterator] !== 'function')
        ) {
          throw new TypeError('Stream response body must be iterable')
        }
        const wire =
          streamSchema === undefined || format === undefined
            ? source
            : format.encode(encodedStream(source, streamSchema))
        return { kind: 'stream', value: wire }
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
    return (value) => ({
      status,
      headers: {},
      body: { kind: 'raw' as const, value: value['body'] },
    })
  }

  const serializeHeaders = compileResponseHeaders(plan)
  const serializeBody = compileResponseBody(plan)
  const contentType = definition.contentType
  const finalize = (
    initialHeaders: Readonly<Record<string, string>> | undefined,
    serializedBody: SerializedResponseBody
  ): AdapterResponse => {
    let headers = initialHeaders
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

  return (value) => {
    const headers = serializeHeaders(value['headers'])
    const serializedBody = serializeBody(value['body'])
    return isSchemaStepAsync(headers) || isSchemaStepAsync(serializedBody)
      ? Promise.all([headers, serializedBody]).then(([resolvedHeaders, resolvedBody]) =>
          finalize(resolvedHeaders, resolvedBody)
        )
      : finalize(headers, serializedBody)
  }
}

function compileResponseDispatcher(entries: readonly CanonicalResponseEntry[]): RuntimeResponseSerializer {
  if (entries.length === 1) {
    const [status, response] = entries[0]!
    const serialize = compileResponseSerializer(response, status)
    return (value) => {
      if (!isRecord(value) || value['status'] !== status) {
        throw new ServerRuntimeError('invalid-server-response', 500, 'Undeclared response status')
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
      throw new ServerRuntimeError('invalid-server-response', 500, 'Undeclared response status')
    }
    return serialize(value)
  }
}

type CompiledAdapterImplementation = {
  readonly routes: readonly RuntimeRoute[]
  readonly server: RuntimeServer
  runtime?: AdapterRuntime
}

const compiledAdapterImplementations = new WeakMap<object, CompiledAdapterImplementation>()

function compileAdapterImplementation(implementation: object): CompiledAdapterImplementation {
  const cached = compiledAdapterImplementations.get(implementation)
  if (cached !== undefined) return cached

  const server = implementation as unknown as RuntimeServer
  const state = getCompositionState<ServerHandlerBinding>(implementation)
  if (state === undefined) throw new TypeError('Adapter input must be a server implementation')
  const registeredBindings = state.bindings
  const selectedRoutes = registeredBindings.map((binding) => binding.compiled)
  const contractPlan = compileCanonicalContract(server.contract, selectedRoutes)
  const compiled = {
    routes: compileRuntimeRoutes(contractPlan, registeredBindings, server.context !== undefined),
    server,
  }
  compiledAdapterImplementations.set(implementation, compiled)
  return compiled
}

async function executeRuntimeRoute(
  server: RuntimeServer,
  runtime: RuntimeRoute,
  parameters: Readonly<Record<string, string>>,
  input: AdapterRouteInput,
  options: AdapterRuntimeOptions
): Promise<AdapterResponse> {
  const request = input.request
  let phase: AdapterPhase = 'request'

  try {
    const query = runtime.readsQuery ? (input.query ?? emptyQuery) : undefined
    const routeInputStep = runtime.hasInput ? runtime.decodeInput!(parameters, input, query) : emptyRouteInput
    const routeInput = isSchemaStepAsync(routeInputStep) ? await routeInputStep : routeInputStep

    phase = 'context'
    const contextStep =
      server.context === undefined ? emptyContext : server.context({ ...input.contextInput, route: runtime.metadata })
    const context = isSchemaStepAsync(contextStep) ? await contextStep : contextStep
    if (!isRecord(context)) {
      throw new ServerRuntimeError('invalid-context', 500, 'Context must be an object')
    }

    const sharedInput =
      runtime.errors === undefined
        ? { context, response: createServerResponse, route: runtime.metadata }
        : { context, errors: runtime.errors.factories, response: createServerResponse, route: runtime.metadata }
    const handlerInput = runtime.hasInput ? { ...sharedInput, ...routeInput } : sharedInput

    phase = 'handler'
    const resultStep =
      runtime.middlewares.length === 0
        ? runtime.handler(handlerInput)
        : dispatchMiddlewareSteps(runtime.middlewares, sharedInput, () => runtime.handler(handlerInput), {
            invalidMiddleware: () =>
              new ServerRuntimeError('invalid-server-response', 500, 'Server middleware must be a function'),
            multipleNext: () =>
              new ServerRuntimeError('invalid-server-response', 500, 'Server middleware called next() more than once'),
          })
    const result = isSchemaStepAsync(resultStep) ? await resultStep : resultStep
    phase = 'response'
    const response =
      runtime.errors !== undefined && isDeclaredError(result)
        ? serializeDeclaredError(runtime.errors, result)
        : runtime.serializeResponse(result)
    return isSchemaStepAsync(response) ? await response : response
  } catch (error) {
    let caughtError = error
    if (phase === 'handler' && runtime.errors !== undefined && isDeclaredError(error)) {
      try {
        phase = 'response'
        const response = serializeDeclaredError(runtime.errors, error)
        return isSchemaStepAsync(response) ? await response : response
      } catch (serializationError) {
        caughtError = serializationError
      }
    }
    const fallback = errorResponse(caughtError, phase)
    const replacement = await options.onError?.({
      error: caughtError,
      phase,
      request,
      ...(input.hostContext === undefined ? {} : { hostContext: input.hostContext }),
      route: runtime.metadata,
      defaultResponse: fallback,
    })
    return replacement ?? fallback
  }
}

/** Compiles a transport-neutral executor for every route selected by an implementation or fragment. */
export function createAdapterRuntime<
  const ContractType extends Contract,
  const Context extends object,
  const Adapter extends ServerAdapter | undefined,
>(
  implementation: ServerExecutable<ContractType, Context, Adapter>,
  options: AdapterRuntimeOptions = {}
): AdapterRuntime {
  const compiledImplementation = compileAdapterImplementation(implementation)
  if (options.onError === undefined && compiledImplementation.runtime !== undefined) {
    return compiledImplementation.runtime
  }
  const { routes, server } = compiledImplementation
  const adapterRoutes = Object.freeze(
    routes.map((runtime) => {
      const compiled = runtime.compiled
      return Object.freeze({
        key: compiled.key,
        method: compiled.method,
        path: compiled.path,
        execute: (input: AdapterRouteInput) =>
          executeRuntimeRoute(server, runtime, input.params ?? emptyParameters, input, options),
      })
    })
  )
  const runtime = Object.freeze({ routes: adapterRoutes })
  if (options.onError === undefined) compiledImplementation.runtime = runtime
  return runtime
}

/** Creates a catch-all dispatcher by composing the shared matcher with the route-level adapter runtime. */
export function createAdapterHandler<
  const ContractType extends Contract,
  const Context extends object,
  const Adapter extends ServerAdapter | undefined,
>(
  implementation: ServerExecutable<ContractType, Context, Adapter>,
  options: AdapterRuntimeOptions = {}
): AdapterHandler {
  const { routes, server } = compileAdapterImplementation(implementation)
  const routing = compileRoutingTable(routes)

  const handler = async (input: AdapterDispatchInput): Promise<AdapterResponse> => {
    const request = input.request

    try {
      if (typeof input.method !== 'string' || typeof input.pathname !== 'string') {
        throw new TypeError('Adapter input must provide a method and pathname')
      }
      const selection = selectRoute(routing, input.pathname, input.method.toUpperCase())
      if (selection.kind === 'miss') {
        if (selection.allowed.length === 0) return simpleProblem(404, 'route-not-found', 'Route not found')
        return simpleProblem(405, 'method-not-allowed', 'Method not allowed', {
          allow: selection.allowed.join(', '),
        })
      }

      const match = selection.match
      return executeRuntimeRoute(server, match.runtime, match.parameters, input, options)
    } catch (error) {
      const fallback = errorResponse(error, 'routing')
      const replacement = await options.onError?.({
        error,
        phase: 'routing',
        request,
        ...(input.hostContext === undefined ? {} : { hostContext: input.hostContext }),
        defaultResponse: fallback,
      })
      return replacement ?? fallback
    }
  }

  return handler
}
