import type { JsonValue, ResponseBody, ResponseHeaders, RouteResponse } from './contract/response'
import type { AnySchema, NonSchemaOptions, SchemaInput } from './validation'

export type StreamSource<Value> = AsyncIterable<Value> | Iterable<Value>
export type StreamWireSchema<Wire, Schema extends AnySchema = AnySchema> =
  SchemaInput<Schema> extends Wire ? Schema : never

export type StreamFormatMetadata<Id extends string = string, ContentType extends string = string> = {
  readonly kind: 'stream-format'
  readonly id: Id
  readonly contentType: ContentType
}

export type StreamDefinition<
  Schema extends AnySchema = AnySchema,
  Format extends StreamFormatMetadata = StreamFormatMetadata,
> = {
  readonly kind: 'stream-definition'
  readonly schema: Schema
  readonly format: Format
}

export type AnyStreamDefinition = StreamDefinition<AnySchema, StreamFormatMetadata>

export type StreamResponseBody = ResponseBody<'stream'>

export type FormattedStreamResponseBody<
  Schema extends AnySchema = AnySchema,
  Format extends StreamFormatMetadata = StreamFormatMetadata,
> = ResponseBody<
  'stream',
  Schema,
  {
    readonly format: Format
  }
>

type StreamResponseOptions<
  Headers extends ResponseHeaders | undefined,
  ContentType extends string,
> = NonSchemaOptions & {
  readonly headers?: Headers
  readonly contentType?: ContentType
}

type OpaqueStreamResponseOptions<
  Headers extends ResponseHeaders | undefined,
  ContentType extends string,
> = StreamResponseOptions<Headers, ContentType> & {
  readonly kind?: never
}

export type StreamResponseFactory = {
  <
    const Headers extends ResponseHeaders | undefined = undefined,
    const ContentType extends string = 'application/octet-stream',
  >(
    options?: OpaqueStreamResponseOptions<Headers, ContentType>
  ): RouteResponse<StreamResponseBody, Headers, ContentType>
  <
    const Definition extends AnyStreamDefinition,
    const Headers extends ResponseHeaders | undefined = undefined,
    const ContentType extends string = Definition['format']['contentType'],
  >(
    definition: Definition,
    options?: StreamResponseOptions<Headers, ContentType>
  ): RouteResponse<FormattedStreamResponseBody<Definition['schema'], Definition['format']>, Headers, ContentType>
}

export type StreamFormat<Wire, Id extends string = string, ContentType extends string = string> = {
  <const Schema extends AnySchema>(
    schema: StreamWireSchema<Wire, Schema>
  ): StreamDefinition<Schema, StreamFormat<Wire, Id, ContentType>>
  readonly kind: 'stream-format'
  readonly id: Id
  readonly contentType: ContentType
  readonly encode: (source: StreamSource<Wire>) => AsyncIterable<Uint8Array>
  readonly decode: (source: StreamSource<Uint8Array>) => AsyncIterable<Wire>
}

export type StreamFormatOptions<Wire, Id extends string, ContentType extends string> = {
  readonly id: Id
  readonly contentType: ContentType
  readonly encode: (source: StreamSource<Wire>) => AsyncIterable<Uint8Array>
  readonly decode: (source: StreamSource<Uint8Array>) => AsyncIterable<Wire>
}

/** Defines reusable framing for a sequence of schema-encoded wire values. */
export function defineStreamFormat<Wire, const Id extends string, const ContentType extends string>(
  options: StreamFormatOptions<Wire, Id, ContentType>
): StreamFormat<Wire, Id, ContentType> {
  const format = (<const Schema extends AnySchema>(
    schema: StreamWireSchema<Wire, Schema>
  ): StreamDefinition<Schema, StreamFormat<Wire, Id, ContentType>> =>
    Object.freeze({
      kind: 'stream-definition',
      schema,
      format,
    })) as StreamFormat<Wire, Id, ContentType>

  Object.assign(format, {
    kind: 'stream-format' as const,
    id: options.id,
    contentType: options.contentType,
    encode: options.encode,
    decode: options.decode,
  })

  return Object.freeze(format)
}

const textEncoder = /* @__PURE__ */ new TextEncoder()

function stringifyJson(value: JsonValue): string {
  const encoded = JSON.stringify(value)
  if (encoded === undefined) throw new TypeError('Stream item cannot be encoded as JSON')
  return encoded
}

async function* decodeTextLines(source: StreamSource<Uint8Array>): AsyncIterable<string> {
  const decoder = new TextDecoder()
  let buffer = ''
  let scanStart = 0

  function takeLine(final: boolean): string | undefined {
    for (let index = scanStart; index < buffer.length; index++) {
      const character = buffer[index]
      if (character === '\n') {
        const line = buffer.slice(0, index)
        buffer = buffer.slice(index + 1)
        scanStart = 0
        return line
      }

      if (character === '\r') {
        if (index === buffer.length - 1 && !final) {
          scanStart = index
          return undefined
        }
        const line = buffer.slice(0, index)
        buffer = buffer.slice(index + (buffer[index + 1] === '\n' ? 2 : 1))
        scanStart = 0
        return line
      }
    }

    if (final && buffer.length > 0) {
      const line = buffer
      buffer = ''
      scanStart = 0
      return line
    }

    scanStart = buffer.length
    return undefined
  }

  for await (const chunk of source) {
    buffer += decoder.decode(chunk, { stream: true })
    let line = takeLine(false)
    while (line !== undefined) {
      yield line
      line = takeLine(false)
    }
  }

  buffer += decoder.decode()
  let line = takeLine(true)
  while (line !== undefined) {
    yield line
    line = takeLine(true)
  }
}

function isStreamDefinition(value: unknown): value is AnyStreamDefinition {
  return (
    typeof value === 'object' && value !== null && (value as { readonly kind?: unknown }).kind === 'stream-definition'
  )
}

export function defineStreamResponse(): StreamResponseFactory {
  const streamResponse = (
    definitionOrOptions?: AnyStreamDefinition | StreamResponseOptions<ResponseHeaders | undefined, string>,
    explicitOptions?: StreamResponseOptions<ResponseHeaders | undefined, string>
  ): RouteResponse<StreamResponseBody | FormattedStreamResponseBody, ResponseHeaders | undefined, string> => {
    const definition = isStreamDefinition(definitionOrOptions) ? definitionOrOptions : undefined
    const options =
      definition === undefined
        ? (definitionOrOptions as StreamResponseOptions<ResponseHeaders | undefined, string> | undefined)
        : explicitOptions
    const body =
      definition === undefined
        ? Object.freeze({ kind: 'stream' as const })
        : Object.freeze({ kind: 'stream' as const, schema: definition.schema, format: definition.format })

    return Object.freeze({
      kind: 'response',
      body,
      headers: options?.headers,
      contentType: options?.contentType ?? definition?.format.contentType ?? 'application/octet-stream',
    })
  }

  return streamResponse as StreamResponseFactory
}

async function* encodeNdjson(source: StreamSource<JsonValue>): AsyncIterable<Uint8Array> {
  for await (const value of source) yield textEncoder.encode(`${stringifyJson(value)}\n`)
}

async function* decodeNdjson(source: StreamSource<Uint8Array>): AsyncIterable<JsonValue> {
  for await (const line of decodeTextLines(source)) {
    if (line.length > 0) yield JSON.parse(line) as JsonValue
  }
}

async function* encodeSseJson(source: StreamSource<JsonValue>): AsyncIterable<Uint8Array> {
  for await (const value of source) yield textEncoder.encode(`data: ${stringifyJson(value)}\n\n`)
}

async function* decodeSseJson(source: StreamSource<Uint8Array>): AsyncIterable<JsonValue> {
  let data: string[] = []

  for await (const line of decodeTextLines(source)) {
    if (line === '') {
      if (data.length > 0) {
        yield JSON.parse(data.join('\n')) as JsonValue
        data = []
      }
      continue
    }

    if (line.startsWith(':')) continue

    const separator = line.indexOf(':')
    const field = separator === -1 ? line : line.slice(0, separator)
    let value = separator === -1 ? '' : line.slice(separator + 1)
    if (value.startsWith(' ')) value = value.slice(1)
    if (field === 'data') data.push(value)
  }
}

/** Frames JSON wire values as newline-delimited JSON records. */
export const ndjson = /* @__PURE__ */ defineStreamFormat({
  id: 'ndjson',
  contentType: 'application/x-ndjson',
  encode: encodeNdjson,
  decode: decodeNdjson,
})

/**
 * Frames JSON wire values in server-sent event data fields.
 * Event names, IDs, retry directives, and reconnection policy remain application concerns.
 */
export const sseJson = /* @__PURE__ */ defineStreamFormat({
  id: 'sse-json',
  contentType: 'text/event-stream',
  encode: encodeSseJson,
  decode: decodeSseJson,
})
