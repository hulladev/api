import type { ClientRoutePlan } from '../contract/client-plan'
import type { QueryWireObject } from '../contract/query'
import { textWireObject, type RequestBodyKind } from '../contract/request'
import { type ExecutionStep, mapExecutionSteps, mapExecutionStep } from '../execution'
import type { ResponseHeaderValues } from '../headers'
import { setOwn } from '../object'

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

function mergedHeaders(
  configured: Readonly<Record<string, string | undefined>> | undefined,
  options: Readonly<Record<string, string | undefined>> | undefined,
  routeHeaders: Readonly<Record<string, string | undefined>> | undefined,
  contentType: string | undefined
): Record<string, string> {
  const headers: Record<string, string> = {}
  assignHeaders(headers, configured)
  assignHeaders(headers, options)
  assignHeaders(headers, routeHeaders)
  if (contentType !== undefined) setOwn(headers, 'content-type', contentType)
  return headers
}

function transportRequest(
  plan: ClientRoutePlan,
  path: string,
  options: ClientRequestOptions,
  headers: Record<string, string>,
  query?: QueryWireObject,
  body?: ClientTransportBody
): ClientTransportRequest {
  return {
    key: plan.compiled.key,
    method: plan.compiled.method,
    path,
    ...(query === undefined ? {} : { query }),
    headers,
    ...(body === undefined ? {} : { body }),
    ...(options.signal === undefined ? {} : { signal: options.signal }),
  }
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

export function compileClientRequest(plan: ClientRoutePlan, configuredHeaders?: ClientHeaders): ClientRequestCreator {
  const compiled = plan.compiled
  const encodePath = plan.encodePath
  const encodeQuery = plan.encodeQuery
  const encodeHeaders = plan.headers?.encode
  const hasRouteHeaders = plan.headers !== undefined
  const encodeBody = plan.body?.schema.encode
  const hasBody = plan.body !== undefined
  const staticPath = encodePath === undefined ? compiled.path : undefined

  const routeHeaders = (value: unknown): ExecutionStep<Readonly<Record<string, string | undefined>>> =>
    encodeHeaders === undefined
      ? textWireObject(value, 'headers')
      : mapExecutionStep(encodeHeaders(value), (encoded) => textWireObject(encoded, 'headers'))
  const requestBody = (value: unknown): ExecutionStep<ClientTransportBody> => {
    const body = plan.body!
    return encodeBody === undefined
      ? encodedBody(body.declaration.representation, body.declaration.contentType, value)
      : mapExecutionStep(encodeBody(value), (encoded) =>
          encodedBody(body.declaration.representation, body.declaration.contentType, encoded)
        )
  }

  if (
    staticPath !== undefined &&
    encodeQuery === undefined &&
    !hasRouteHeaders &&
    !hasBody &&
    configuredHeaders === undefined
  ) {
    return (_input, options) =>
      transportRequest(plan, staticPath, options, mergedHeaders(undefined, options.headers, undefined, undefined))
  }

  if (staticPath !== undefined && encodeQuery === undefined && !hasRouteHeaders && hasBody) {
    return (input, options) =>
      mapExecutionStep(requestBody(input['body']), (body) => {
        const configured = typeof configuredHeaders === 'function' ? configuredHeaders() : configuredHeaders
        return mapExecutionStep(configured, (resolvedHeaders) =>
          transportRequest(
            plan,
            staticPath,
            options,
            mergedHeaders(
              resolvedHeaders,
              options.headers,
              undefined,
              body.kind === 'form-data' ? undefined : body.contentType
            ),
            undefined,
            body
          )
        )
      })
  }

  return (input, options) => {
    const resolved = mapExecutionSteps([0, 1, 2, 3, 4], (field): ExecutionStep<unknown> => {
      switch (field) {
        case 0:
          return staticPath ?? encodePath!(input['params'] as Readonly<Record<string, unknown>>)
        case 1:
          return encodeQuery?.(input['query'] as never)
        case 2:
          return typeof configuredHeaders === 'function' ? configuredHeaders() : configuredHeaders
        case 3:
          return hasRouteHeaders ? routeHeaders(input['headers']) : undefined
        default:
          return hasBody ? requestBody(input['body']) : undefined
      }
    })
    type ResolvedValues = readonly [
      path: string,
      query: QueryWireObject | undefined,
      configuredHeaders: Readonly<Record<string, string | undefined>> | undefined,
      routeHeaders: Readonly<Record<string, string | undefined>> | undefined,
      body: ClientTransportBody | undefined,
    ]
    return mapExecutionStep(
      resolved as unknown as ExecutionStep<ResolvedValues>,
      ([path, query, configured, route, body]) =>
        transportRequest(
          plan,
          path,
          options,
          mergedHeaders(configured, options.headers, route, body?.kind === 'form-data' ? undefined : body?.contentType),
          query,
          body
        )
    )
  }
}
