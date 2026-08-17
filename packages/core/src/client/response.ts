import { annotateAPIErrorIssues, type APIError, type APIErrorIssue, type ClientResponseErrorCode } from '../errors'
import { mimeEssence } from '../request'
import type { AnyRouteResponse, ResponseBodyValue, ResponseHeaders, RouteResponses } from '../response'
import type { CanonicalResponsePlan } from '../route-plan'
import type { StreamFormat } from '../stream'
import type { SchemaOutput } from '../validation'

export type { ClientResponseErrorCode } from '../errors'

type ClientResponseBodyFields<ResponseDefinition extends AnyRouteResponse> = ResponseDefinition['body'] extends {
  readonly kind: 'empty'
}
  ? { readonly body?: never }
  : { readonly body: ResponseBodyValue<ResponseDefinition['body']> }

type ClientResponseHeaderFields<ResponseDefinition extends AnyRouteResponse> =
  ResponseDefinition['headers'] extends ResponseHeaders
    ? { readonly headers: SchemaOutput<ResponseDefinition['headers']> }
    : { readonly headers: Headers }

type ClientResponseBodyArguments<ResponseDefinition extends AnyRouteResponse> = ResponseDefinition['body'] extends {
  readonly kind: 'empty'
}
  ? readonly [body?: undefined]
  : readonly [body: ClientResponseBodyFields<ResponseDefinition>['body']]

type ClientResponseHeaderArguments<ResponseDefinition extends AnyRouteResponse> =
  ResponseDefinition['headers'] extends ResponseHeaders
    ? readonly [headers: SchemaOutput<ResponseDefinition['headers']>]
    : readonly [headers?: Headers]

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

export const createClientResponse = ((status: number, body?: unknown, headers?: Headers) => ({
  status,
  headers: headers ?? (body instanceof Response ? body.headers : new Headers()),
  ...(body === undefined ? {} : { body }),
})) as ClientResponseFactory<RouteResponses>

export type ClientResponseIssue = APIErrorIssue & {
  readonly location: 'response'
  readonly code: ClientResponseErrorCode
}

export class ClientResponseError extends Error implements APIError<ClientResponseErrorCode, ClientResponseIssue> {
  readonly code: ClientResponseErrorCode
  readonly issues: readonly ClientResponseIssue[]
  readonly response: Response

  constructor(code: ClientResponseErrorCode, response: Response, message: string, options?: ErrorOptions) {
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

export type ClientResponseDecoder = (response: Response) => Promise<unknown>

function responseBytes(response: Response): AsyncIterable<Uint8Array> {
  async function* read(): AsyncIterable<Uint8Array> {
    if (response.body === null) {
      throw new ClientResponseError('missing-body', response, `Response ${response.status} has no stream body`)
    }

    const reader = response.body.getReader()
    try {
      while (true) {
        const result = await reader.read()
        if (result.done) return
        yield result.value
      }
    } finally {
      reader.releaseLock()
    }
  }

  return read()
}

function decodedStream(response: Response, plan: DecodableStreamPlan): AsyncIterable<unknown> {
  async function* decode(): AsyncIterable<unknown> {
    for await (const value of plan.format.decode(responseBytes(response))) {
      yield await plan.decode(value)
    }
  }

  return decode()
}

function assertContentType(response: Response, expected: string | undefined): void {
  if (expected === undefined) return
  const header = response.headers.get('content-type') ?? ''
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

function compileBodyDecoder(plan: CanonicalResponsePlan): (response: Response) => Promise<unknown> {
  const definition = plan.definition
  const body = definition.body
  switch (body.kind) {
    case 'empty':
      return async () => undefined
    case 'raw':
      return async (response) => response
    case 'json': {
      const decode = plan.body!.decode
      return async (response) => decode(await response.json())
    }
    case 'text': {
      const decode = plan.body!.decode
      return async (response) => decode(await response.text())
    }
    case 'bytes': {
      const decode = plan.body!.decode
      return async (response) => decode(new Uint8Array(await response.arrayBuffer()))
    }
    case 'form-data': {
      const decode = plan.body!.decode
      return async (response) => decode(await response.formData())
    }
    case 'stream': {
      if (!('schema' in body)) return async (response) => responseBytes(response)
      const decode = plan.body!.decode
      const streamPlan = { decode, format: body.format as unknown as StreamFormat<unknown> }
      return async (response) => decodedStream(response, streamPlan)
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
        : await Promise.all([decodeHeaders(Object.fromEntries(response.headers.entries())), decodeBody(response)])

    return empty ? { status: response.status, headers } : { status: response.status, headers, body }
  }

  responseDecoders.set(plan, decode)
  return decode
}
