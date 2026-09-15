import type { CompiledContractRoute } from '../compiler'
import { compilePathParameterValues, compilePathRenderer } from '../contract/parameters'
import { compileQueryEncoder } from '../contract/query'
import type { QueryWireObject } from '../contract/query'
import { textWireEntries, type TextWireEntries, type RequestBodyKind } from '../contract/request'
import { compileExecutionFields, mapExecutionStep, type ExecutionField, type ExecutionStep } from '../execution'
import type { ResponseHeaderValues } from '../headers'
import { setOwn } from '../object'
import { compileSchemaExecution } from '../validation'

export type ClientRequestOptions = {
  readonly headers?: Readonly<Record<string, string | undefined>>
  readonly signal?: AbortSignal
}

export type ClientHeaders =
  | Readonly<Record<string, string | undefined>>
  | (() =>
      | Readonly<Record<string, string | undefined>>
      | undefined
      | PromiseLike<Readonly<Record<string, string | undefined>> | undefined>)

export type ClientTransportBody = {
  readonly kind: RequestBodyKind
  readonly value: unknown
  readonly contentType: string
}

/** A transport-neutral, schema-encoded client invocation. */
export type ClientTransportRequest = {
  readonly key: readonly string[]
  readonly method: string
  readonly path: string
  readonly params?: Readonly<Record<string, string>>
  readonly query?: QueryWireObject
  readonly headers: Record<string, string>
  readonly body?: ClientTransportBody
  readonly signal?: AbortSignal
}

export type ClientTransportResponse = {
  readonly status: number
  readonly headers: ResponseHeaderValues
  /** The adapter-native response, event, or message when one exists. */
  readonly native?: unknown
  /** Releases an unread/rejected response; raw and streaming successes transfer ownership to the caller. */
  readonly dispose?: (reason?: unknown) => ExecutionStep<void>
  /** Reads the response using the representation selected by its declared status. */
  /** A concurrent decoder may reject while reading; keep the owned reader cancellable in that case. */
  readonly readBody: (
    kind: 'bytes' | 'form-data' | 'json' | 'raw' | 'stream' | 'text',
    options?: { readonly cancellable: true }
  ) => ExecutionStep<unknown>
}

export type ClientTransport = (request: ClientTransportRequest) => ExecutionStep<ClientTransportResponse>

export type ClientRequestCreator = (
  input: Readonly<Record<string, unknown>>,
  options: ClientRequestOptions
) => ExecutionStep<ClientTransportRequest>

function assignHeaders(
  target: Record<string, string>,
  source: Readonly<Record<string, string | undefined>> | undefined
): void {
  if (source === undefined) return
  for (const [name, value] of Object.entries(source)) {
    const normalized = name.toLowerCase()
    if (value === undefined) delete target[normalized]
    else setOwn(target, normalized, value)
  }
}

function normalizedHeaders(value: Readonly<Record<string, string | undefined>> | undefined): Record<string, string> {
  const headers: Record<string, string> = {}
  assignHeaders(headers, value)
  return headers
}

function mergedHeaders(
  configured: Readonly<Record<string, string>> | undefined,
  options: Readonly<Record<string, string | undefined>> | undefined,
  routeHeaders: TextWireEntries | undefined,
  contentType: string | undefined
): Record<string, string> {
  const headers: Record<string, string> = { ...configured }
  assignHeaders(headers, options)
  if (routeHeaders !== undefined) {
    for (const [name, value] of routeHeaders) {
      const normalized = name.toLowerCase()
      if (value === undefined) delete headers[normalized]
      else setOwn(headers, normalized, value)
    }
  }
  if (contentType !== undefined) setOwn(headers, 'content-type', contentType)
  return headers
}

function encodedBody(kind: RequestBodyKind, contentType: string, value: unknown): ClientTransportBody {
  switch (kind) {
    case 'json':
      break
    case 'text':
      if (typeof value !== 'string') throw new TypeError('Text request body must encode to a string')
      break
    case 'bytes':
      if (!(value instanceof Uint8Array)) throw new TypeError('Byte request body must encode to a Uint8Array')
      break
    case 'form-data':
      break
  }
  return { kind, value, contentType }
}

export function compileClientRequest(
  compiled: CompiledContractRoute,
  configuredHeaders?: ClientHeaders
): ClientRequestCreator {
  const staticHeaders = typeof configuredHeaders === 'function' ? undefined : normalizedHeaders(configuredHeaders)
  const route = compiled.route
  const encodeParams =
    compiled.pathParameters.length === 0 ? undefined : compilePathParameterValues(compiled.pathParameters)
  const renderPath = compilePathRenderer(compiled.path)
  const encodeQuery = route.query === undefined ? undefined : compileQueryEncoder(route.query)
  const encodeHeaders =
    route.headers === undefined ? undefined : compileSchemaExecution(route.headers, { location: 'headers' }).encode
  const body = route.body
  const encodeBody = body === undefined ? undefined : compileSchemaExecution(body.schema, { location: 'body' }).encode

  const fields: ExecutionField<[Readonly<Record<string, unknown>>]>[] = []
  if (encodeParams !== undefined)
    fields.push(['params', (input) => encodeParams(input['params'] as Readonly<Record<string, unknown>>)])
  if (encodeQuery !== undefined) fields.push(['query', (input) => encodeQuery(input['query'] as never)])
  if (typeof configuredHeaders === 'function')
    fields.push(['configured', () => mapExecutionStep(configuredHeaders(), normalizedHeaders)])
  if (route.headers !== undefined)
    fields.push([
      'headers',
      (input) =>
        mapExecutionStep(
          encodeHeaders === undefined
            ? input['headers']
            : encodeHeaders(input['headers'] as Readonly<Record<string, unknown>>),
          (value) => textWireEntries(value, 'headers')
        ),
    ])
  if (body !== undefined)
    fields.push(['body', (input) => (encodeBody === undefined ? input['body'] : encodeBody(input['body']))])
  const read = compileExecutionFields(fields)
  return (input, options) =>
    mapExecutionStep(read(input), (values) => {
      const params = values['params'] as Readonly<Record<string, string>> | undefined
      const query = values['query'] as QueryWireObject | undefined
      const configured =
        typeof configuredHeaders === 'function' ? (values['configured'] as Record<string, string>) : staticHeaders
      const headers = values['headers'] as TextWireEntries | undefined
      const payload =
        body === undefined ? undefined : encodedBody(body.representation, body.contentType, values['body'])
      return Object.freeze({
        key: compiled.key,
        method: compiled.method,
        path: params === undefined ? compiled.path : renderPath(params),
        ...(params === undefined ? {} : { params }),
        headers: mergedHeaders(
          configured,
          options.headers,
          headers,
          payload?.kind === 'form-data' ? undefined : payload?.contentType
        ),
        ...(query === undefined ? {} : { query }),
        ...(payload === undefined ? {} : { body: payload }),
        ...(options.signal === undefined ? {} : { signal: options.signal }),
      })
    })
}
