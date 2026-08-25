import type { CanonicalErrorDeclarationPlan, CanonicalResponsePlan } from '../contract/plan'
import { mimeEssence } from '../contract/request'
import type { AnyRouteResponse, ResponseBodyValue, ResponseHeaders, RouteResponses } from '../contract/response'
import { DeclaredError, type ClientErrorMode } from '../declared-errors'
import { annotateAPIErrorIssues, type APIError, type APIErrorIssue, type ClientResponseErrorCode } from '../errors'
import { isRecord } from '../object'
import type { StreamFormat } from '../stream'
import type { SchemaOutput } from '../validation'
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
    : { readonly headers: Readonly<Record<string, string>> }

type ClientResponseBodyArguments<ResponseDefinition extends AnyRouteResponse> = ResponseDefinition['body'] extends {
  readonly kind: 'empty'
}
  ? readonly [body?: undefined]
  : readonly [body: ClientResponseBodyFields<ResponseDefinition>['body']]

type ClientResponseHeaderArguments<ResponseDefinition extends AnyRouteResponse> =
  ResponseDefinition['headers'] extends ResponseHeaders
    ? readonly [headers: SchemaOutput<ResponseDefinition['headers']>]
    : readonly [headers?: Readonly<Record<string, string>>]

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

export const createClientResponse = ((status: number, body?: unknown, headers?: Readonly<Record<string, string>>) => ({
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

type DecodableStreamPlan = {
  readonly decode: (value: unknown) => unknown | PromiseLike<unknown>
  readonly format: StreamFormat<unknown>
}

export type ClientResponseDecoder = (response: ClientTransportResponse) => Promise<unknown>

function decodedStream(source: AsyncIterable<Uint8Array>, plan: DecodableStreamPlan): AsyncIterable<unknown> {
  async function* decode(): AsyncIterable<unknown> {
    for await (const value of plan.format.decode(source)) {
      yield await plan.decode(value)
    }
  }

  return decode()
}

function assertContentType(response: ClientTransportResponse, expected: string | undefined): void {
  if (expected === undefined) return
  const header = response.headers['content-type'] ?? ''
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
  declarations: readonly CanonicalErrorDeclarationPlan[],
  mode: ClientErrorMode
): ClientResponseDecoder {
  const byCode = new Map(declarations.map((plan) => [plan.declaration.code, plan]))
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
    const data = plan.data === undefined ? undefined : await plan.data.decode(body!['data'])
    if (mode === 'throw') throw new DeclaredError(plan.declaration, data, message)
    return {
      status,
      headers: response.headers,
      body: { code, message, ...(plan.data === undefined ? {} : { data }) },
    }
  }
}

function compileBodyDecoder(plan: CanonicalResponsePlan): (response: ClientTransportResponse) => Promise<unknown> {
  const definition = plan.definition
  const body = definition.body
  switch (body.kind) {
    case 'empty':
      return async () => undefined
    case 'raw':
      return async (response) => response.native ?? response.readBody('raw')
    case 'json': {
      const decode = plan.body!.decode
      return async (response) => decode(await response.readBody('json'))
    }
    case 'text': {
      const decode = plan.body!.decode
      return async (response) => decode(await response.readBody('text'))
    }
    case 'bytes': {
      const decode = plan.body!.decode
      return async (response) => decode(await response.readBody('bytes'))
    }
    case 'form-data': {
      const decode = plan.body!.decode
      return async (response) => decode(await response.readBody('form-data'))
    }
    case 'stream': {
      if (!('schema' in body)) {
        return async (response) => response.readBody('stream') as Promise<AsyncIterable<Uint8Array>>
      }
      const decode = plan.body!.decode
      const streamPlan = { decode, format: body.format as unknown as StreamFormat<unknown> }
      return async (response) =>
        decodedStream((await response.readBody('stream')) as AsyncIterable<Uint8Array>, streamPlan)
    }
  }
}

const responseDecoders = new WeakMap<CanonicalResponsePlan, ClientResponseDecoder>()

export function compileClientResponse(plan: CanonicalResponsePlan): ClientResponseDecoder {
  const cached = responseDecoders.get(plan)
  if (cached !== undefined) return cached

  const definition = plan.definition
  const decodeBody = compileBodyDecoder(plan)
  const decodeHeaders = plan.headers?.decode
  const empty = definition.body.kind === 'empty'

  const decode: ClientResponseDecoder = async (response) => {
    assertContentType(response, plan.expectedContentType)
    const [headers, body] =
      decodeHeaders === undefined
        ? [response.headers, await decodeBody(response)]
        : await Promise.all([decodeHeaders(response.headers), decodeBody(response)])

    return empty ? { status: response.status, headers } : { status: response.status, headers, body }
  }

  responseDecoders.set(plan, decode)
  return decode
}
