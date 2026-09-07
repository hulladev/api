import { ServerRuntimeError } from '../server/errors'

export const DEFAULT_MAX_BODY_BYTES = 1_048_576

export function bodyLimit(value = DEFAULT_MAX_BODY_BYTES): number {
  if (value !== Infinity && (!Number.isSafeInteger(value) || value < 0)) {
    throw new TypeError('maxBodyBytes must be a non-negative safe integer or Infinity')
  }
  return value
}

/** Counts actual incoming bytes, including requests without a Content-Length. */
export async function readBodyBytes(source: AsyncIterable<Uint8Array>, limit: number): Promise<Uint8Array> {
  const chunks: Uint8Array[] = []
  let length = 0
  for await (const chunk of source) {
    length += chunk.byteLength
    if (length > limit)
      throw new ServerRuntimeError('request-body-too-large', 413, 'Request body exceeds maxBodyBytes', {
        location: 'body',
      })
    chunks.push(chunk)
  }
  if (chunks.length === 1) return chunks[0]!
  const bytes = new Uint8Array(length)
  let offset = 0
  for (const chunk of chunks) {
    bytes.set(chunk, offset)
    offset += chunk.byteLength
  }
  return bytes
}

export async function* readableBytes(stream: ReadableStream<Uint8Array>): AsyncIterable<Uint8Array> {
  const reader = stream.getReader()
  let complete = false
  try {
    while (true) {
      const result = await reader.read()
      if (result.done) {
        complete = true
        return
      }
      yield result.value
    }
  } finally {
    // A tee branch's cancellation may await the other branch. Do not deadlock cleanup.
    if (!complete) void reader.cancel().catch(() => {})
    reader.releaseLock()
  }
}
