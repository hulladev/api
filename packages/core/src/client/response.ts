import { mimeEssence } from '../contract/request'
import type { AnyRouteResponse, ResponseBodyValue, ResponseHeaders, RouteResponses } from '../contract/response'
import { compileResponseSchema, type ResponseSchema } from '../contract/schema'
import { DeclaredError, type AnyErrorDeclaration, type ClientErrorMode } from '../declared-errors'
import { annotateAPIErrorIssues, type APIError, type APIErrorIssue, type ClientResponseErrorCode } from '../errors'
import { isPromiseLike, mapExecutionStep, type ExecutionStep } from '../execution'
import { responseHeader } from '../headers'
import type { ResponseHeaderValues } from '../headers'
import { isRecord } from '../object'
import type { StreamFormat } from '../stream'
import { compileSchemaExecution, type SchemaOutput } from '../validation'
import type { ClientTransportResponse } from './request'

export type { ClientResponseErrorCode } from '../errors'

type ClientResponseBodyFields<ResponseDefinition extends AnyRouteResponse> = ResponseDefinition['body'] extends {
  readonly kind: 'empty'
}
  ? { readonly body?: never }
  : { readonly body: ResponseBodyValue<ResponseDefinition['body']> }

type ClientResponseHeaderFields<ResponseDefinition extends AnyRouteResponse> =
  ResponseDefinition['headers'] extends ResponseHeaders
    ? { readonly headers: SchemaOutput<ResponseDefinition['headers']> }
    : { readonly headers: ResponseHeaderValues }

type ClientResponseBodyArguments<ResponseDefinition extends AnyRouteResponse> = ResponseDefinition['body'] extends {
  readonly kind: 'empty'
}
  ? readonly [body?: undefined]
  : readonly [body: ClientResponseBodyFields<ResponseDefinition>['body']]

type ClientResponseHeaderArguments<ResponseDefinition extends AnyRouteResponse> =
  ResponseDefinition['headers'] extends ResponseHeaders
    ? readonly [headers: SchemaOutput<ResponseDefinition['headers']>]
    : readonly [headers?: ResponseHeaderValues]

export type ClientResponseResultFor<Status extends number, ResponseDefinition extends AnyRouteResponse> = {
  readonly status: Status
} & ClientResponseBodyFields<ResponseDefinition> &
  ClientResponseHeaderFields<ResponseDefinition>

export type ClientResponseResult<Responses extends RouteResponses> = {
  readonly [Status in Extract<keyof Responses, number>]: ClientResponseResultFor<Status, Responses[Status]>
}[Extract<keyof Responses, number>]

export type ClientResponseFactory<Responses extends RouteResponses> = <Status extends Extract<keyof Responses, number>>(
  status: Status,
  ...arguments_: readonly [
    ...ClientResponseBodyArguments<Responses[Status]>,
    ...ClientResponseHeaderArguments<Responses[Status]>,
  ]
) => ClientResponseResultFor<Status, Responses[Status]>

export const createClientResponse = ((status: number, body?: unknown, headers?: ResponseHeaderValues) => ({
  status,
  headers: headers ?? {},
  ...(body === undefined ? {} : { body }),
})) as ClientResponseFactory<RouteResponses>

export type ClientResponseIssue = APIErrorIssue & {
  readonly location: 'response'
  readonly code: ClientResponseErrorCode
}

export class ClientResponseError extends Error implements APIError<ClientResponseErrorCode, ClientResponseIssue> {
  readonly code: ClientResponseErrorCode
  readonly issues: readonly ClientResponseIssue[]
  readonly response: ClientTransportResponse

  constructor(
    code: ClientResponseErrorCode,
    response: ClientTransportResponse,
    message: string,
    options?: ErrorOptions
  ) {
    super(message, options)
    this.name = 'ClientResponseError'
    this.code = code
    this.issues = annotateAPIErrorIssues([{ message }], {
      code,
      location: 'response',
    }) as readonly ClientResponseIssue[]
    this.response = response
  }
}

export type ClientResponseDecoder = (response: ClientTransportResponse) => ExecutionStep<unknown>

async function* decodedStream(
  source: AsyncIterable<unknown>,
  decode: (value: unknown) => ExecutionStep<unknown>
): AsyncIterable<unknown> {
  for await (const value of source) yield decode(value)
}

/** Owns cancellation independently of whether a lazy decoder has started. */
function ownedStream(
  source: AsyncIterable<unknown> | Iterable<unknown>,
  response: ClientTransportResponse
): AsyncIterableIterator<unknown> {
  const iterator = Symbol.asyncIterator in source ? source[Symbol.asyncIterator]() : source[Symbol.iterator]()
  let returning: Promise<IteratorResult<unknown>> | undefined
  let closed = false
  let failed = false
  let failure: unknown
  const close = (reason?: unknown) =>
    (returning ??= (async () => {
      closed = true
      try {
        await response.dispose?.(reason)
      } finally {
        await iterator.return?.()
      }
      return { done: true as const, value: undefined }
    })())
  return {
    [Symbol.asyncIterator]() {
      return this
    },
    next: async () => {
      if (failed) throw failure
      if (closed) return { done: true, value: undefined }
      try {
        return await iterator.next()
      } catch (error) {
        failed = true
        failure = error
        try {
          await close(error)
        } catch {
          // Cleanup must not replace the producer or decoding failure.
        }
        throw error
      }
    },
    return: () => close(),
  }
}

function assertContentType(response: ClientTransportResponse, expected: string | undefined): void {
  if (expected === undefined) return
  const header = responseHeader(response.headers, 'content-type') ?? ''
  if (header === expected || header.startsWith(`${expected};`)) return

  const received = mimeEssence(header)
  if (received !== expected) {
    throw new ClientResponseError(
      'content-type-mismatch',
      response,
      `Expected response content type ${expected}, received ${received || 'none'}`
    )
  }
}

export function compileClientErrorResponse(
  status: number,
  declarations: readonly AnyErrorDeclaration[],
  mode: ClientErrorMode
): ClientResponseDecoder {
  const byCode = new Map(
    declarations.map((declaration) => [
      declaration.code,
      {
        declaration,
        data:
          declaration.data === undefined
            ? undefined
            : compileSchemaExecution(declaration.data, { location: 'response' }),
      },
    ])
  )
  return async (response) => {
    assertContentType(response, 'application/json')
    const value = await response.readBody('json')
    const body = isRecord(value) ? value : undefined
    const code = body?.['code']
    const message = body?.['message']
    const plan = typeof code === 'string' ? byCode.get(code) : undefined
    if (plan === undefined || typeof message !== 'string') {
      throw new ClientResponseError('invalid-error-response', response, `Invalid declared error response ${status}`)
    }
    const decodeData = plan.data?.encode === undefined ? undefined : plan.data.decode
    const data =
      plan.data === undefined ? undefined : decodeData === undefined ? body!['data'] : await decodeData(body!['data'])
    if (mode === 'throw') throw new DeclaredError(plan.declaration, data, message)
    return {
      status,
      headers: response.headers,
      body: { code, message, ...(plan.data === undefined ? {} : { data }) },
    }
  }
}

const cancellableRead = Object.freeze({ cancellable: true as const })

function compileBodyDecoder(
  plan: ResponseSchema
): (response: ClientTransportResponse, cancellable?: boolean) => ExecutionStep<unknown> {
  const body = plan.definition.body
  const decode = plan.body?.encode === undefined ? undefined : plan.body.decode
  return (response, cancellable) => {
    if (body.kind === 'empty') return mapExecutionStep(response.dispose?.(), () => undefined)
    if (body.kind === 'raw') return response.native ?? response.readBody('raw')
    const source = response.readBody(body.kind, cancellable ? cancellableRead : undefined)
    return mapExecutionStep(source, (value) => {
      if (body.kind !== 'stream') return decode === undefined ? value : decode(value)
      const stream =
        'schema' in body
          ? (body.format as StreamFormat<unknown>).decode(value as AsyncIterable<Uint8Array>)
          : (value as AsyncIterable<unknown>)
      return ownedStream(decode === undefined ? stream : decodedStream(stream, decode), response)
    })
  }
}

const responseDecoders = new WeakMap<ResponseSchema, ClientResponseDecoder>()

export function compileClientResponse(definition: AnyRouteResponse): ClientResponseDecoder {
  const plan = compileResponseSchema(definition)
  const cached = responseDecoders.get(plan)
  if (cached !== undefined) return cached

  const decodeBody = compileBodyDecoder(plan)
  const decodeHeaders = plan.headers?.encode === undefined ? undefined : plan.headers.decode
  const empty = definition.body.kind === 'empty'

  const decode: ClientResponseDecoder = (response) => {
    assertContentType(response, plan.expectedContentType)
    const finish = (headers: unknown, body: unknown) =>
      empty ? { status: response.status, headers } : { status: response.status, headers, body }
    const headers = decodeHeaders === undefined ? response.headers : decodeHeaders(response.headers)
    if (!isPromiseLike(headers)) return mapExecutionStep(decodeBody(response), (body) => finish(headers, body))
    // Once header validation suspends, own both failures and keep the body cancellable.
    return Promise.all([headers, Promise.resolve().then(() => decodeBody(response, true))]).then(([headers, body]) =>
      finish(headers, body)
    )
  }

  responseDecoders.set(plan, decode)
  return decode
}
