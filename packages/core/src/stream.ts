import type {
  CheckedResponseHeaders,
  JsonValue,
  ResponseBody,
  ResponseHeaders,
  RouteResponse,
} from './contract/response'
import type { AnySchema, NonSchemaOptions, SchemaWireOutput } from './validation'

export type StreamSource<Value> = AsyncIterable<Value> | Iterable<Value>
export type StreamWireSchema<Wire, Schema extends AnySchema = AnySchema> =
  SchemaWireOutput<Schema> extends Wire ? Schema : never

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
  readonly headers?: CheckedResponseHeaders<Headers>
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

async function* decodeTextRecords<Value>(
  source: StreamSource<Uint8Array>,
  maxRecordBytes: number,
  readRecord: (line: string) => Value | undefined
): AsyncIterable<Value> {
  const decoder = new TextDecoder()
  let buffer = ''
  let scanStart = 0
  let recordBytes = 0

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
    for (const byte of chunk) {
      if (byte === 10 || byte === 13) recordBytes = 0
      else if (++recordBytes > maxRecordBytes) throw new RangeError('Stream record exceeds maxRecordBytes')
    }
    buffer += decoder.decode(chunk, { stream: true })
    let line = takeLine(false)
    while (line !== undefined) {
      const value = readRecord(line)
      if (value !== undefined) yield value
      line = takeLine(false)
    }
  }

  buffer += decoder.decode()
  let line = takeLine(true)
  while (line !== undefined) {
    const value = readRecord(line)
    if (value !== undefined) yield value
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

function decodeNdjson(source: StreamSource<Uint8Array>, limit: number): AsyncIterable<JsonValue> {
  return decodeTextRecords(source, limit, (line) => (line.length === 0 ? undefined : (JSON.parse(line) as JsonValue)))
}

async function* encodeSseJson(source: StreamSource<JsonValue>): AsyncIterable<Uint8Array> {
  for await (const value of source) yield textEncoder.encode(`data: ${stringifyJson(value)}\n\n`)
}

function decodeSseJson(source: StreamSource<Uint8Array>, limit: number): AsyncIterable<JsonValue> {
  let data: string[] = []
  let dataBytes = 0

  return decodeTextRecords(source, limit, (line) => {
    if (line === '') {
      if (data.length > 0) {
        const value = JSON.parse(data.join('\n')) as JsonValue
        data = []
        dataBytes = 0
        return value
      }
      return undefined
    }

    if (line.startsWith(':')) return undefined

    const separator = line.indexOf(':')
    const field = separator === -1 ? line : line.slice(0, separator)
    let value = separator === -1 ? '' : line.slice(separator + 1)
    if (value.startsWith(' ')) value = value.slice(1)
    if (field === 'data') {
      dataBytes += textEncoder.encode(value).byteLength + 1
      if (dataBytes > limit) throw new RangeError('SSE event exceeds maxRecordBytes')
      data.push(value)
    }
    return undefined
  })
}

export type JsonStreamOptions = { readonly maxRecordBytes?: number }

function recordLimit(options: JsonStreamOptions): number {
  const limit = options.maxRecordBytes ?? 1_048_576
  if (limit !== Infinity && (!Number.isSafeInteger(limit) || limit < 0))
    throw new TypeError('maxRecordBytes must be a non-negative safe integer or Infinity')
  return limit
}

/** Creates NDJSON framing with a bound on incoming record bytes. */
export function createNdjsonFormat(options: JsonStreamOptions = {}) {
  const limit = recordLimit(options)
  return defineStreamFormat({
    id: 'ndjson',
    contentType: 'application/x-ndjson',
    encode: encodeNdjson,
    decode: (source: StreamSource<Uint8Array>) => decodeNdjson(source, limit),
  })
}

/** Creates JSON SSE framing with a bound on incoming line and event bytes. */
export function createSseJsonFormat(options: JsonStreamOptions = {}) {
  const limit = recordLimit(options)
  return defineStreamFormat({
    id: 'sse-json',
    contentType: 'text/event-stream',
    encode: encodeSseJson,
    decode: (source: StreamSource<Uint8Array>) => decodeSseJson(source, limit),
  })
}

export const ndjson = /* @__PURE__ */ createNdjsonFormat()
export const sseJson = /* @__PURE__ */ createSseJsonFormat()
