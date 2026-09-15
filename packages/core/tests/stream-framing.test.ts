import { expect, test } from 'vitest'
import { createNdjsonFormat, createSseJsonFormat, ndjson, sseJson } from '../src/stream'

const encoder = new TextEncoder()

test.each([
  { format: ndjson, text: '\r\n{"text":"雪 🌿"}\r\nnull\rfalse\n0', expected: [{ text: '雪 🌿' }, null, false, 0] },
  {
    format: sseJson,
    text: ': comment\r\ndata: {"text":\r\ndata: "雪 🌿"}\r\n\r\ndata: null\n\ndata: false\r\rdata: 0\n\n',
    expected: [{ text: '雪 🌿' }, null, false, 0],
  },
])('preserves $format.id framing at every byte split', async ({ format, text, expected }) => {
  const bytes = encoder.encode(text)
  for (let split = 0; split <= bytes.length; split++) {
    const values = []
    for await (const value of format.decode([bytes.slice(0, split), bytes.slice(split)])) values.push(value)
    expect(values).toEqual(expected)
  }
})

test.each([
  { format: ndjson, wire: 'null\nINVALID\n' },
  { format: sseJson, wire: 'data: null\n\ndata: INVALID\n\n' },
])(
  'keeps $format.id parsing lazy and closes its producer on cancellation or parse failure',
  async ({ format, wire }) => {
    for (const cancel of [true, false]) {
      let closed = 0
      let pulls = 0
      async function* source() {
        try {
          pulls++
          yield encoder.encode(wire)
          pulls++
          yield encoder.encode('unused')
        } finally {
          closed++
        }
      }
      const iterator = format.decode(source())[Symbol.asyncIterator]()
      await expect(iterator.next()).resolves.toMatchObject({ value: null, done: false })
      expect(pulls).toBe(1)
      const outcome = await Promise.resolve(cancel ? iterator.return?.() : iterator.next()).then(
        () => 'completed',
        (error: unknown) => (error instanceof SyntaxError ? 'syntax-error' : 'other-error')
      )
      expect(outcome).toBe(cancel ? 'completed' : 'syntax-error')
      expect(closed).toBe(1)
      expect(pulls).toBe(1)
    }
  }
)

test('enforces both NDJSON record bytes and accumulated SSE event bytes', async () => {
  const ndjson = createNdjsonFormat({ maxRecordBytes: 3 })
  const sse = createSseJsonFormat({ maxRecordBytes: 10 })
  async function consume(source: AsyncIterable<unknown>) {
    for await (const _value of source) {
      /* consume */
    }
  }
  await expect(consume(ndjson.decode([encoder.encode('"雪"\n')]))).rejects.toThrow(
    'Stream record exceeds maxRecordBytes'
  )
  // Every line fits, while the accumulated event does not.
  await expect(consume(sse.decode([encoder.encode('data: 123\ndata: 456\ndata: 789\n\n')]))).rejects.toThrow(
    'SSE event exceeds maxRecordBytes'
  )
})
