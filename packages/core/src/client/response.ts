import { annotateAPIErrorIssues, type APIError, type APIErrorIssue, type ClientResponseErrorCode } from '../errors'
import { mimeEssence } from '../request'
import type { AnyRouteResponse, ResponseBodyValue, ResponseHeaders, RouteResponses } from '../response'
import type { StreamFormat } from '../stream'
import { decodeSchemaValue, type AnySchema, type SchemaOutput } from '../validation'

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

export type ClientResponseResultFor<Status extends number, ResponseDefinition extends AnyRouteResponse> = {
  readonly status: Status
} & ClientResponseBodyFields<ResponseDefinition> &
  ClientResponseHeaderFields<ResponseDefinition>

export type ClientResponseResult<Responses extends RouteResponses> = {
  readonly [Status in Extract<keyof Responses, number>]: ClientResponseResultFor<Status, Responses[Status]>
}[Extract<keyof Responses, number>]

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

type DecodableStreamDefinition = {
  readonly schema: AnySchema
  readonly format: StreamFormat<unknown>
}

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

function decodedStream(response: Response, definition: DecodableStreamDefinition): AsyncIterable<unknown> {
  async function* decode(): AsyncIterable<unknown> {
    for await (const value of definition.format.decode(responseBytes(response))) {
      yield await decodeSchemaValue(definition.schema, value, { location: 'response' })
    }
  }

  return decode()
}

function assertContentType(response: Response, definition: AnyRouteResponse): void {
  if (definition.contentType === undefined) return
  const expected = mimeEssence(definition.contentType)
  const received = mimeEssence(response.headers.get('content-type') ?? '')
  if (received !== expected) {
    throw new ClientResponseError(
      'content-type-mismatch',
      response,
      `Expected response content type ${expected}, received ${received || 'none'}`
    )
  }
}

async function decodeResponseBody(response: Response, definition: AnyRouteResponse): Promise<unknown> {
  const body = definition.body

  switch (body.kind) {
    case 'empty':
      return undefined
    case 'raw':
      return response
    case 'json':
      return decodeSchemaValue(body.schema, await response.json(), { location: 'response' })
    case 'text':
      return decodeSchemaValue(body.schema, await response.text(), { location: 'response' })
    case 'bytes':
      return decodeSchemaValue(body.schema, new Uint8Array(await response.arrayBuffer()), { location: 'response' })
    case 'form-data':
      return decodeSchemaValue(body.schema, await response.formData(), { location: 'response' })
    case 'stream':
      return 'schema' in body
        ? decodedStream(response, {
            schema: body.schema,
            format: body.format as unknown as StreamFormat<unknown>,
          })
        : responseBytes(response)
  }
}

async function decodeResponseHeaders(response: Response, schema: ResponseHeaders | undefined): Promise<unknown> {
  if (schema === undefined) return response.headers
  return decodeSchemaValue(schema, Object.fromEntries(response.headers.entries()), { location: 'headers' })
}

export async function decodeClientResponse(response: Response, definition: AnyRouteResponse): Promise<unknown> {
  assertContentType(response, definition)
  const [headers, body] =
    definition.headers === undefined
      ? [response.headers, await decodeResponseBody(response, definition)]
      : await Promise.all([
          decodeResponseHeaders(response, definition.headers),
          decodeResponseBody(response, definition),
        ])

  return {
    status: response.status,
    headers,
    ...(definition.body.kind === 'empty' ? {} : { body }),
  }
}
