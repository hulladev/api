import { describe, expect, expectTypeOf, test } from 'vitest'
import { z } from 'zod'
import { response } from '../src/response'
import { defineStreamFormat, ndjson, sse, type StreamSource } from '../src/stream'

async function collect<Value>(source: AsyncIterable<Value>): Promise<Value[]> {
  const values: Value[] = []
  for await (const value of source) values.push(value)
  return values
}

function chunks(value: string, offsets: readonly number[]): Uint8Array[] {
  const encoded = new TextEncoder().encode(value)
  const result: Uint8Array[] = []
  let start = 0

  for (const offset of offsets) {
    result.push(encoded.slice(start, offset))
    start = offset
  }

  result.push(encoded.slice(start))
  return result
}

describe('stream formats', () => {
  test('adds typed format and item schema metadata to stream responses', () => {
    const dateCodec = z.codec(z.iso.datetime(), z.date(), {
      decode: (value) => new Date(value),
      encode: (value) => value.toISOString(),
    })
    const schema = z.object({ id: z.string(), createdAt: dateCodec })
    const headers = z.object({ etag: z.string() })
    const definition = ndjson(schema)
    const declaration = response.stream(definition, { headers })

    expect(definition).toEqual({ kind: 'stream-definition', schema, format: ndjson })
    expect(declaration).toEqual({
      kind: 'response',
      body: { kind: 'stream', schema, format: ndjson },
      headers,
      contentType: 'application/x-ndjson',
    })
    expect(Object.isFrozen(definition)).toBe(true)
    expect(Object.isFrozen(ndjson)).toBe(true)
    expect(Object.isFrozen(declaration)).toBe(true)
    expect(Object.isFrozen(declaration.body)).toBe(true)
    expectTypeOf(declaration.body.schema).toEqualTypeOf<typeof schema>()
    expectTypeOf(declaration.body.format).toEqualTypeOf<typeof ndjson>()
    expectTypeOf(declaration.headers).toEqualTypeOf<typeof headers>()
    expectTypeOf(declaration.contentType).toEqualTypeOf<'application/x-ndjson'>()
    expectTypeOf<z.input<typeof declaration.body.schema>>().toEqualTypeOf<{
      id: string
      createdAt: string
    }>()
    expectTypeOf<z.output<typeof declaration.body.schema>>().toEqualTypeOf<{
      id: string
      createdAt: Date
    }>()
  })

  test('preserves opaque byte streams and explicit media types', () => {
    const opaque = response.stream()
    const video = response.stream({ contentType: 'video/mp4' })
    const vendorJson = response.stream(ndjson(z.string()), {
      contentType: 'application/vnd.example.events+json',
    })

    expect(opaque.body).toEqual({ kind: 'stream' })
    expect(opaque.contentType).toBe('application/octet-stream')
    expect(video.contentType).toBe('video/mp4')
    expect(vendorJson.contentType).toBe('application/vnd.example.events+json')
    expectTypeOf(opaque.body).toEqualTypeOf<{ readonly kind: 'stream' }>()
    expectTypeOf(video.contentType).toEqualTypeOf<'video/mp4'>()
    expectTypeOf(vendorJson.contentType).toEqualTypeOf<'application/vnd.example.events+json'>()
  })

  test('encodes and incrementally decodes NDJSON records', async () => {
    const values = [{ message: 'ahoj žluťoučký' }, { complete: true }]
    const encoded = await collect(ndjson.encode(values))

    expect(encoded.map((value) => new TextDecoder().decode(value)).join('')).toBe(
      '{"message":"ahoj žluťoučký"}\n{"complete":true}\n'
    )

    const decoded = await collect(
      ndjson.decode(chunks('{"message":"ahoj žluťoučký"}\r\n\n{"complete":true}', [7, 21, 32]))
    )

    expect(decoded).toEqual(values)
  })

  test('resumes scanning a fragmented record without losing content', async () => {
    const value = { message: 'x'.repeat(1_024) }
    const encoded = new TextEncoder().encode(`${JSON.stringify(value)}\n`)
    const byteChunks = Array.from(encoded, (byte) => Uint8Array.of(byte))

    await expect(collect(ndjson.decode(byteChunks))).resolves.toEqual([value])
  })

  test('encodes JSON data as SSE and handles fragmented event fields', async () => {
    const encoded = await collect(sse.encode([{ progress: 0.5 }, 'complete']))

    expect(encoded.map((value) => new TextDecoder().decode(value)).join('')).toBe(
      'data: {"progress":0.5}\n\ndata: "complete"\n\n'
    )

    const decoded = await collect(
      sse.decode(
        chunks(': keepalive\r\nevent: update\r\ndata: {"id":\r\ndata: "one"}\r\nid: event-1\r\n\r\n', [2, 19, 37])
      )
    )

    expect(decoded).toEqual([{ id: 'one' }])
  })

  test('supports custom formats without expanding the response namespace', async () => {
    const textLines = defineStreamFormat({
      id: 'text-lines',
      contentType: 'text/plain; charset=utf-8',
      async *encode(source: StreamSource<string>) {
        for await (const value of source) yield new TextEncoder().encode(`${value}\n`)
      },
      async *decode(source: StreamSource<Uint8Array>) {
        for await (const value of source) yield new TextDecoder().decode(value).replace(/\n$/, '')
      },
    })
    const schema = z.string().transform((value) => value.toUpperCase())
    const declaration = response.stream(textLines(schema))

    expect(declaration.contentType).toBe('text/plain; charset=utf-8')
    expect(declaration.body.format.id).toBe('text-lines')
    await expect(collect(textLines.decode(await collect(textLines.encode(['one', 'two']))))).resolves.toEqual([
      'one',
      'two',
    ])
    expectTypeOf(declaration.body.schema).toEqualTypeOf<typeof schema>()

    // @ts-expect-error This format requires schemas whose wire representation is a string.
    textLines(z.number())
  })

  test('rejects schemas that cannot encode to JSON wire values', () => {
    ndjson(z.object({ message: z.string() }))
    sse(z.string())

    // @ts-expect-error Bigints are not JSON wire values.
    ndjson(z.bigint())

    // @ts-expect-error Dates require a JSON-compatible directional codec.
    sse(z.date())

    // @ts-expect-error A format must first be bound to an item schema.
    response.stream(ndjson)
  })
})
