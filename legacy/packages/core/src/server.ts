import {
  decodeHTTPValue,
  encodeHTTPValue,
  hullaRequestIdHeader,
  protocolHeaders,
  type HullaAPIErrorCode,
} from './codec'
import { ProcedureInputError, procedureExecuteKey, type ExecutableProcedure } from './execution'
import { isInputTupleSchema } from './input'
import type {
  HTTPContract,
  HTTPInputContract,
  HTTPMethod,
  HTTPRoute,
  HTTPRouteContract,
  HTTPWireType,
  ProcedureExecutionContext,
  Schema,
} from './types.public'
import { objectHTTPWire } from './wire'
import { decodeHTTPBodyValue, decodeHTTPURLValue, isPlainObject } from './wire-codec'

export type { ProcedureExecutionContext } from './types.public'

export type ApiProcedure = ((...args: never[]) => unknown) & {
  readonly $meta: {
    readonly input?: Schema
    readonly output?: Schema
    readonly name?: string
    readonly router?: string
    readonly route?: HTTPRoute
  }
}

export type ApiRouter = Record<string, ApiProcedure>
export type ApiRouters = Readonly<Record<string, ApiRouter>>

export type ApiHandlerOptions = {
  readonly routers: ApiRouters | readonly ApiRouter[]
  readonly basePath?: string
  readonly contract?: HTTPContract
}

export type ApiHandler = {
  fetch(request: Request): Promise<Response>
}

type CompiledRoute = {
  readonly procedure: ApiProcedure
  readonly method: HTTPMethod
  readonly segments: readonly string[]
  readonly parameterNames: readonly string[]
  readonly contract?: HTTPRouteContract
}

type CompiledRoutes = {
  readonly byPathShape: ReadonlyMap<string, readonly CompiledRoute[]>
}

type QueryValues = Record<string, string | readonly string[]>

class InputConflictError extends Error {
  constructor(field: string, locations: readonly [string, string]) {
    super(`Input field "${field}" conflicts between ${locations[0]} and ${locations[1]}.`)
    this.name = 'InputConflictError'
  }
}

class UnsupportedMediaTypeError extends Error {
  constructor() {
    super('Request bodies must use application/json or an application/*+json media type.')
    this.name = 'UnsupportedMediaTypeError'
  }
}

export function createApiHandler(options: ApiHandlerOptions): ApiHandler {
  if (options.contract && options.basePath !== undefined) {
    throw new Error('createApiHandler cannot combine contract and basePath; the contract owns its basePath.')
  }
  const basePath = normalizePath(options.contract?.basePath ?? options.basePath ?? '/api')
  const routes = compileRoutes(
    Array.isArray(options.routers) ? options.routers : Object.values(options.routers),
    options.contract
  )

  return {
    async fetch(request) {
      const path = requestPath(new URL(request.url).pathname, basePath)
      if (path === undefined) return errorResponse('NOT_FOUND', 'Route not found.', 404, request)
      const match = matchRequest(routes, path, request.method.toUpperCase())
      if (match.methods.size === 0) return errorResponse('NOT_FOUND', 'Route not found.', 404, request)
      if (match.route === undefined) {
        const response = errorResponse('METHOD_NOT_ALLOWED', 'Method not allowed.', 405, request)
        response.headers.set('allow', [...match.methods].join(', '))
        return response
      }

      try {
        const { route, values } = match.route
        const inputSchema = route.procedure.$meta.input
        const input = await readInput(request, route, values, inputSchema)
        if (!inputSchema && input.present)
          return errorResponse('INVALID_INPUT', 'This route does not accept input.', 400, request)
        const context: ProcedureExecutionContext = { request, signal: request.signal }
        const parsedInput = inputSchema ? parseProcedureInput(inputSchema, input.value) : undefined
        const result = await executable(route.procedure)[procedureExecuteKey]([], context, {
          inputParsed: inputSchema !== undefined,
          parsedInput,
        })
        const headers = protocolHeaders(undefined, request.headers.get(hullaRequestIdHeader))
        if (result === undefined) return new Response(null, { status: 204, headers })
        if (request.method === 'HEAD') return new Response(null, { status: 200, headers })
        headers.set('content-type', 'application/json')
        return new Response(encodeHTTPValue(result), { status: 200, headers })
      } catch (error) {
        if (error instanceof InputConflictError) return errorResponse('INPUT_CONFLICT', error.message, 409, request)
        if (error instanceof UnsupportedMediaTypeError)
          return errorResponse('UNSUPPORTED_MEDIA_TYPE', error.message, 415, request)
        if (error instanceof ProcedureInputError) return errorResponse('INVALID_INPUT', error.message, 400, request)
        throw error
      }
    },
  }
}

function compileRoutes(routers: readonly ApiRouter[], contract?: HTTPContract): CompiledRoutes {
  if (contract && contract.version !== 1)
    throw new Error(`Unsupported HTTP contract version ${String(contract.version)}.`)
  const result: CompiledRoute[] = []
  const seen = new Set<string>()
  const usedContracts = new Set<string>()
  const overlapCandidates = new Map<string, CompiledRoute[]>()

  for (const router of routers) {
    for (const procedure of Object.values(router)) {
      const meta = procedure?.$meta
      if (!meta?.route) continue
      if (!meta.router || !meta.name) throw new Error('Exposed routes must be defined inside a named router.')
      if (!/^[A-Za-z0-9._~-]+$/.test(meta.router)) throw new Error(`Unsafe router path segment "${meta.router}"`)
      const routeSegments = meta.route.path.split('/').filter(Boolean)
      const segments = [meta.router, ...routeSegments]
      const signature = segments.map((segment) => (segment.startsWith(':') ? ':' : segment)).join('/')
      const key = `${meta.route.method} ${signature}`
      if (seen.has(key)) throw new Error(`Routes collide on ${meta.route.method} /${signature}`)
      seen.add(key)
      const parameterNames = segments.filter((segment) => segment.startsWith(':')).map((segment) => segment.slice(1))
      if (parameterNames.length > 0 && meta.input === undefined)
        throw new Error(`Route ${meta.route.method} /${segments.join('/')} has path parameters but no input schema.`)
      const routeContract = contract?.routes[meta.router]?.[meta.name]
      if (contract) {
        if (!routeContract) throw new Error(`HTTP contract is missing route ${meta.router}.${meta.name}.`)
        validateRouteContract(routeContract, procedure, `/${segments.join('/')}`)
        usedContracts.add(`${meta.router}.${meta.name}`)
      }
      const compiled: CompiledRoute = {
        procedure,
        method: meta.route.method,
        segments,
        parameterNames,
        contract: routeContract,
      }
      const overlapKey = `${compiled.method}\0${compiled.segments.length}\0${compiled.segments[0] ?? ''}`
      const candidates = overlapCandidates.get(overlapKey) ?? []
      const ambiguous = candidates.find(
        (candidate) =>
          routesOverlap(candidate, compiled) &&
          !isStrictSpecialization(candidate, compiled) &&
          !isStrictSpecialization(compiled, candidate)
      )
      if (ambiguous) {
        throw new Error(
          `Routes overlap ambiguously on ${compiled.method}: /${ambiguous.segments.join('/')} and /${compiled.segments.join('/')}`
        )
      }
      result.push(compiled)
      candidates.push(compiled)
      overlapCandidates.set(overlapKey, candidates)
    }
  }

  if (contract) {
    for (const [router, procedures] of Object.entries(contract.routes)) {
      for (const procedure of Object.keys(procedures)) {
        if (!usedContracts.has(`${router}.${procedure}`)) {
          throw new Error(`HTTP contract route ${router}.${procedure} has no exposed server procedure.`)
        }
      }
    }
  }
  const byPathShape = new Map<string, CompiledRoute[]>()
  for (const route of result.sort(compareRoutes)) {
    const key = pathShapeKey(route.segments)
    const candidates = byPathShape.get(key) ?? []
    candidates.push(route)
    byPathShape.set(key, candidates)
  }
  return { byPathShape }
}

function matchRequest(
  routes: CompiledRoutes,
  path: readonly string[],
  method: string
): {
  readonly methods: ReadonlySet<HTTPMethod>
  readonly route?: { readonly route: CompiledRoute; readonly values: Record<string, string> }
} {
  const methods = new Set<HTTPMethod>()
  let matched: { route: CompiledRoute; values: Record<string, string> } | undefined

  for (const route of routes.byPathShape.get(pathShapeKey(path)) ?? []) {
    const values = matchSegments(route.segments, path)
    if (values === undefined) continue
    methods.add(route.method)
    if (matched === undefined && route.method === method) matched = { route, values }
  }

  return { methods, route: matched }
}

function pathShapeKey(segments: readonly string[]): string {
  return `${segments.length}\0${segments[0] ?? ''}`
}

function validateRouteContract(contract: HTTPRouteContract, procedure: ApiProcedure, path: string): void {
  const meta = procedure.$meta
  const name = `${meta.router}.${meta.name}`
  if (contract.router !== meta.router || contract.procedure !== meta.name)
    throw new Error(`HTTP contract identity does not match route ${name}.`)
  if (contract.method !== meta.route?.method) throw new Error(`HTTP contract method does not match route ${name}.`)
  if (normalizePath(contract.path) !== normalizePath(path))
    throw new Error(`HTTP contract path does not match route ${name}.`)
  if ((contract.input === undefined) !== (meta.input === undefined))
    throw new Error(`HTTP contract input presence does not match route ${name}.`)
  if (contract.input?.kind === 'tuple') {
    if (!isInputTupleSchema(meta.input)) throw new Error(`HTTP contract input shape does not match route ${name}.`)
    if (contract.input.items.length !== meta.input['hulla.api.inputSchemas'].length)
      throw new Error(`HTTP contract input arity does not match route ${name}.`)
  } else if (contract.input && isInputTupleSchema(meta.input)) {
    throw new Error(`HTTP contract input shape does not match route ${name}.`)
  }
  const parameters = [...contract.path.matchAll(/:([A-Za-z_$][\w$]*)/g)].map((match) => match[1]!)
  if (contract.input?.kind === 'tuple' && parameters.length > contract.input.items.length) {
    throw new Error(`HTTP contract path arity does not match route ${name}.`)
  }
  if (contract.input?.kind === 'value') {
    const object = objectHTTPWire(contract.input.wire)
    if (parameters.length > 1 && !object) throw new Error(`HTTP contract path arity does not match route ${name}.`)
    if (object && parameters.some((parameter) => object.properties[parameter] === undefined)) {
      throw new Error(`HTTP contract path field does not exist in the input for route ${name}.`)
    }
  }
}

function routeScore(route: CompiledRoute): number {
  return route.segments.reduce((score, segment) => score + (segment.startsWith(':') ? 1 : 10), 0)
}

function compareRoutes(left: CompiledRoute, right: CompiledRoute): number {
  if (isStrictSpecialization(left, right)) return -1
  if (isStrictSpecialization(right, left)) return 1
  return routeScore(right) - routeScore(left)
}

function routesOverlap(left: CompiledRoute, right: CompiledRoute): boolean {
  return (
    left.method === right.method &&
    left.segments.length === right.segments.length &&
    left.segments.every((segment, index) => {
      const other = right.segments[index]!
      return segment.startsWith(':') || other.startsWith(':') || segment === other
    })
  )
}

function isStrictSpecialization(specific: CompiledRoute, generic: CompiledRoute): boolean {
  if (specific.method !== generic.method || specific.segments.length !== generic.segments.length) return false
  let stricter = false
  for (const [index, genericSegment] of generic.segments.entries()) {
    const specificSegment = specific.segments[index]!
    if (genericSegment.startsWith(':')) {
      if (!specificSegment.startsWith(':')) stricter = true
      continue
    }
    if (specificSegment !== genericSegment) return false
  }
  return stricter
}

function matchSegments(pattern: readonly string[], actual: readonly string[]): Record<string, string> | undefined {
  if (pattern.length !== actual.length) return undefined
  const values: Record<string, string> = {}
  for (let index = 0; index < pattern.length; index++) {
    const expected = pattern[index]!
    const value = actual[index]!
    if (!expected.startsWith(':')) {
      if (expected !== value) return undefined
      continue
    }
    values[expected.slice(1)] = value
  }
  return values
}

async function readInput(
  request: Request,
  route: CompiledRoute,
  pathValues: Record<string, string>,
  inputSchema: Schema | undefined
): Promise<{ present: boolean; value?: unknown }> {
  const text = request.method === 'GET' || request.method === 'HEAD' ? '' : await request.text()
  try {
    return readInputUnchecked(request, route, pathValues, inputSchema, text)
  } catch (error) {
    if (
      error instanceof InputConflictError ||
      error instanceof ProcedureInputError ||
      error instanceof UnsupportedMediaTypeError
    )
      throw error
    throw new ProcedureInputError(error)
  }
}

function readInputUnchecked(
  request: Request,
  route: CompiledRoute,
  pathValues: Record<string, string>,
  inputSchema: Schema | undefined,
  text: string
): { present: boolean; value?: unknown } {
  const url = new URL(request.url)
  const queryValues = readQuery(url.searchParams)
  const bodyPresent = text.trim().length > 0
  if (bodyPresent && !isJSONMediaType(request.headers.get('content-type'))) throw new UnsupportedMediaTypeError()
  const body = bodyPresent ? decodeHTTPValue(text) : undefined
  const inputContract = route.contract?.input
  const pathInput = route.parameterNames.map((name, index) => {
    const raw = pathValues[name]!
    const wire = inputWire(inputContract, index, name)
    return wire ? decodeHTTPURLValue(wire, raw) : raw
  })
  const hasPath = pathInput.length > 0
  const hasQuery = Object.keys(queryValues).length > 0

  if (inputSchema && isInputTupleSchema(inputSchema)) {
    const remainingCount = inputSchema['hulla.api.inputSchemas'].length - pathInput.length
    if (remainingCount < 0)
      throw new ProcedureInputError('Route path has more parameters than the procedure has positional inputs.')
    const remainingWires = inputContract?.kind === 'tuple' ? inputContract.items.slice(pathInput.length) : []
    const remaining =
      request.method === 'GET' || request.method === 'HEAD'
        ? tupleQueryInput(queryValues, remainingCount, remainingWires)
        : tupleBodyInput(body, bodyPresent, remainingCount, remainingWires)
    return { present: true, value: [...pathInput, ...remaining] }
  }

  const valueWire = inputContract?.kind === 'value' ? inputContract.wire : undefined
  const valueObjectWire = objectHTTPWire(valueWire)
  if (hasPath || hasQuery) {
    if (!hasQuery && !bodyPresent && route.parameterNames.length === 1) return { present: true, value: pathInput[0] }
    if (!hasPath && Object.keys(queryValues).length === 1 && 'input' in queryValues) {
      return {
        present: true,
        value: valueWire ? decodeHTTPURLValue(valueWire, queryValues['input']!) : queryValues['input'],
      }
    }
    if (bodyPresent && !isPlainObject(body))
      throw new ProcedureInputError('Route body must be an object when path or query fields are present.')
    const query = valueObjectWire ? decodeQueryObject(valueObjectWire, queryValues) : queryValues
    const bodyValues = bodyPresent
      ? valueObjectWire
        ? (decodeHTTPBodyValue(valueObjectWire, body) as Record<string, unknown>)
        : (body as Record<string, unknown>)
      : {}
    const path = Object.fromEntries(route.parameterNames.map((name, index) => [name, pathInput[index]])) as Record<
      string,
      unknown
    >
    return { present: true, value: mergeInputSources(query, bodyValues, path) }
  }

  if (!bodyPresent) return { present: false }
  return { present: true, value: valueWire ? decodeHTTPBodyValue(valueWire, body) : body }
}

function isJSONMediaType(value: string | null): boolean {
  if (value === null) return false
  const mediaType = value.split(';', 1)[0]!.trim().toLowerCase()
  return mediaType === 'application/json' || (mediaType.startsWith('application/') && mediaType.endsWith('+json'))
}

function readQuery(query: URLSearchParams): QueryValues {
  const values: QueryValues = {}
  for (const key of new Set(query.keys())) {
    const all = query.getAll(key)
    values[key] = all.length === 1 ? all[0]! : all
  }
  return values
}

function tupleQueryInput(query: QueryValues, count: number, wires: readonly HTTPWireType[]): unknown[] {
  if (count === 0) return []
  const keys = Object.keys(query)
  if (count === 1) {
    if (keys.length === 0) return [undefined]
    if (keys.length === 1 && keys[0] === 'input') {
      return [wires[0] ? decodeHTTPURLValue(wires[0], query['input']!) : query['input']]
    }
    const objectWire = objectHTTPWire(wires[0])
    return [objectWire ? decodeQueryObject(objectWire, query) : query]
  }
  if (keys.length === 1 && keys[0] === 'input') {
    const raw = query['input']!
    const values = typeof raw === 'string' ? [raw] : [...raw]
    if (values.length > count) throw new ProcedureInputError(`Expected at most ${count} positional query inputs.`)
    return Array.from({ length: count }, (_, index) =>
      index >= values.length
        ? undefined
        : wires[index]
          ? decodeHTTPURLValue(wires[index]!, values[index]!)
          : values[index]
    )
  }
  if (keys.every((key) => /^input\.\d+$/.test(key))) {
    const values = Array.from({ length: count }, () => undefined as unknown)
    for (const key of keys) {
      const index = Number(key.slice('input.'.length))
      const entry = query[key]!
      if (index >= count || typeof entry !== 'string')
        throw new ProcedureInputError(`Invalid positional query input "${key}".`)
      values[index] = wires[index] ? decodeHTTPURLValue(wires[index]!, entry) : entry
    }
    return values
  }
  throw new ProcedureInputError('Multiple positional query inputs must use repeated "input" parameters.')
}

function tupleBodyInput(body: unknown, present: boolean, count: number, wires: readonly HTTPWireType[]): unknown[] {
  if (count === 0) {
    if (present) throw new ProcedureInputError('This route does not accept a request body.')
    return []
  }
  if (!present) return Array.from({ length: count }, () => undefined)
  if (count === 1) return [wires[0] ? decodeHTTPBodyValue(wires[0], body) : body]
  if (!Array.isArray(body)) throw new ProcedureInputError('Multiple positional body inputs require a JSON array.')
  if (body.length > count) throw new ProcedureInputError(`Expected at most ${count} positional body inputs.`)
  return Array.from({ length: count }, (_, index) =>
    index >= body.length ? undefined : wires[index] ? decodeHTTPBodyValue(wires[index]!, body[index]) : body[index]
  )
}

function decodeQueryObject(
  wire: Extract<HTTPWireType, { kind: 'object' }>,
  query: QueryValues
): Record<string, unknown> {
  const result: Record<string, unknown> = {}
  for (const [key, raw] of Object.entries(query)) {
    const property = wire.properties[key]
    if (property) result[key] = decodeHTTPURLValue(property, raw)
    else if (wire.additionalProperties) result[key] = decodeHTTPURLValue(wire.additionalProperties, raw)
    else throw new TypeError(`Unexpected query parameter "${key}".`)
  }
  return result
}

function inputWire(
  input: HTTPInputContract | undefined,
  tupleIndex: number,
  objectKey: string
): HTTPWireType | undefined {
  if (!input) return undefined
  if (input.kind === 'tuple') return input.items[tupleIndex]
  const objectWire = objectHTTPWire(input.wire)
  if (objectWire) return objectWire.properties[objectKey]
  return input.wire
}

function parseProcedureInput(schema: Schema, value: unknown): unknown {
  try {
    return schema.parse(value)
  } catch (error) {
    throw new ProcedureInputError(error)
  }
}

function mergeInputSources(
  query: Record<string, unknown>,
  body: Record<string, unknown>,
  path: Record<string, unknown>
): Record<string, unknown> {
  const merged: Record<string, unknown> = {}
  const locations = new Map<string, string>()
  for (const [location, values] of [
    ['query', query],
    ['body', body],
    ['path', path],
  ] as const) {
    for (const [key, value] of Object.entries(values)) {
      const previous = locations.get(key)
      if (previous !== undefined && !equalHTTPValue(merged[key], value)) {
        throw new InputConflictError(key, [previous, location])
      }
      merged[key] = value
      locations.set(key, location)
    }
  }
  return merged
}

function equalHTTPValue(left: unknown, right: unknown): boolean {
  if (Object.is(left, right)) return true
  if (typeof left === 'bigint' && typeof right === 'bigint') return left === right
  if (left instanceof Date && right instanceof Date) return left.getTime() === right.getTime()
  if (left instanceof Uint8Array && right instanceof Uint8Array) {
    return left.length === right.length && left.every((value, index) => value === right[index])
  }
  if (Array.isArray(left) && Array.isArray(right)) {
    return left.length === right.length && left.every((value, index) => equalHTTPValue(value, right[index]))
  }
  if (isPlainObject(left) && isPlainObject(right)) {
    const keys = Object.keys(left)
    return (
      keys.length === Object.keys(right).length &&
      keys.every((key) => key in right && equalHTTPValue(left[key], right[key]))
    )
  }
  return false
}

function executable(procedure: ApiProcedure): ExecutableProcedure {
  const candidate = procedure as ApiProcedure & Partial<ExecutableProcedure>
  if (candidate[procedureExecuteKey] === undefined) throw new Error('Route procedure is not executable.')
  return candidate as ApiProcedure & ExecutableProcedure
}

function requestPath(pathname: string, basePath: string): string[] | undefined {
  const normalized = normalizePath(pathname)
  if (normalized !== basePath && !normalized.startsWith(`${basePath}/`)) return undefined
  const suffix = normalized.slice(basePath.length).replace(/^\//, '')
  if (!suffix) return []
  try {
    return suffix.split('/').map(decodeURIComponent)
  } catch {
    return undefined
  }
}

function normalizePath(path: string): string {
  const normalized = path.startsWith('/') ? path : `/${path}`
  return normalized.length > 1 ? normalized.replace(/\/+$/, '') : normalized
}

function errorResponse(
  code: Exclude<HullaAPIErrorCode, 'UNKNOWN_ERROR'>,
  message: string,
  status: number,
  request: Request
) {
  return Response.json(
    { code, message },
    { status, headers: protocolHeaders(undefined, request.headers.get(hullaRequestIdHeader)) }
  )
}
