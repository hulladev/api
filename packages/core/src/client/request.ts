import { type ExecutionStep, isPromiseLike, mapExecutionStep } from '../execution'
import { setOwn } from '../object'
import type { QueryWireObject } from '../query'
import { textWireObject, type RequestBodyKind } from '../request'
import type { CanonicalRoutePlan } from '../route-plan'

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
  readonly headers: Readonly<Record<string, string>>
  /** The adapter-native response, event, or message when one exists. */
  readonly native?: unknown
  /** Reads the response using the representation selected by its declared status. */
  readonly readBody: (kind: 'bytes' | 'form-data' | 'json' | 'raw' | 'stream' | 'text') => ExecutionStep<unknown>
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
  plan: CanonicalRoutePlan,
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

export function compileClientRequest(
  plan: CanonicalRoutePlan,
  configuredHeaders?: ClientHeaders
): ClientRequestCreator {
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
    const values = [
      staticPath ?? encodePath!(input['params'] as Readonly<Record<string, unknown>>),
      encodeQuery?.(input['query'] as never),
      typeof configuredHeaders === 'function' ? configuredHeaders() : configuredHeaders,
      hasRouteHeaders ? routeHeaders(input['headers']) : undefined,
      hasBody ? requestBody(input['body']) : undefined,
    ] as const
    type ResolvedValues = readonly [
      path: string,
      query: QueryWireObject | undefined,
      configuredHeaders: Readonly<Record<string, string | undefined>> | undefined,
      routeHeaders: Readonly<Record<string, string | undefined>> | undefined,
      body: ClientTransportBody | undefined,
    ]
    const resolved = values.some(isPromiseLike) ? Promise.all(values) : values
    return mapExecutionStep(resolved as ExecutionStep<ResolvedValues>, ([path, query, configured, route, body]) =>
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
