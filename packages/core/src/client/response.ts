import { mimeEssence } from '../request'
import type { AnyRouteResponse, ResponseBodyValue, ResponseHeaders, RouteResponses } from '../response'
import type { StreamFormat } from '../stream'
import { decodeSchema, type AnySchema, type SchemaOutput } from '../validation'

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

export type ClientResponseErrorCode = 'content-type-mismatch' | 'missing-body' | 'unexpected-status'

export class ClientResponseError extends Error {
  readonly code: ClientResponseErrorCode
  readonly response: Response

  constructor(code: ClientResponseErrorCode, response: Response, message: string) {
    super(message)
    this.name = 'ClientResponseError'
    this.code = code
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
      yield decodeSchema(definition.schema, value)
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
      return decodeSchema(body.schema, await response.json())
    case 'text':
      return decodeSchema(body.schema, await response.text())
    case 'bytes':
      return decodeSchema(body.schema, new Uint8Array(await response.arrayBuffer()))
    case 'form-data':
      return decodeSchema(body.schema, await response.formData())
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
  return decodeSchema(schema, Object.fromEntries(response.headers.entries()))
}

export async function decodeClientResponse(response: Response, definition: AnyRouteResponse): Promise<unknown> {
  assertContentType(response, definition)
  const headers = await decodeResponseHeaders(response, definition.headers)
  const body = await decodeResponseBody(response, definition)

  return Object.freeze({
    status: response.status,
    headers,
    ...(definition.body.kind === 'empty' ? {} : { body }),
  })
}
