import type { IncomingHttpHeaders, IncomingMessage, ServerResponse } from 'node:http'
import { readBodyBytes, toFetchHeaders, type AdapterResponse } from '@hulla/api/adapters'

/** Reads one normalized Node header without copying unrelated fields. */
export function nodeRequestHeader(source: IncomingHttpHeaders, name: string): string | undefined {
  if (name.startsWith(':') || !Object.hasOwn(source, name)) return undefined
  const value = source[name]
  return typeof value === 'string' ? value : value?.join(', ')
}

export function nodeRequestHeaders(source: IncomingHttpHeaders): Readonly<Record<string, string>> {
  const entries = Object.entries(source)
  let length = 0
  for (const entry of entries) {
    const [name, value] = entry
    if (value === undefined || name.startsWith(':')) continue
    entry[1] = typeof value === 'string' ? value : value.join(', ')
    entries[length++] = entry
  }
  entries.length = length
  return Object.fromEntries(entries) as Record<string, string>
}

export function createNodeBodyReader(request: IncomingMessage, limit: number, host = 'Node HTTP') {
  let body: Promise<Uint8Array> | undefined
  return async (representation: string): Promise<unknown> => {
    const bytes = await (body ??= readBodyBytes(
      request.iterator({ destroyOnReturn: false }) as AsyncIterable<Uint8Array>,
      limit
    ).catch((error) => {
      request.resume()
      throw error
    }))
    switch (representation) {
      case 'json':
        return JSON.parse(new TextDecoder().decode(bytes)) as unknown
      case 'text':
        return new TextDecoder().decode(bytes)
      case 'bytes':
        return bytes
      case 'form-data': {
        const contentType = request.headers['content-type']
        return new Response(bytes as BodyInit, {
          ...(contentType === undefined ? {} : { headers: { 'content-type': contentType } }),
        }).formData()
      }
      default:
        throw new TypeError(`Unsupported ${host} request body representation ${representation}`)
    }
  }
}

/** Request lifetime shared by Node HTTP and Express; never retained after response completion. */
export function nodeRequestLifetime(request: IncomingMessage, response: ServerResponse) {
  const controller = new AbortController()
  const abort = () => controller.abort(new Error('HTTP connection closed'))
  const close = () => {
    if (!response.writableEnded) abort()
    dispose()
  }
  const dispose = () => {
    request.off('aborted', abort)
    response.off('close', close)
    response.off('finish', dispose)
  }
  request.once('aborted', abort)
  response.once('close', close)
  response.once('finish', dispose)
  if (request.destroyed && !request.complete) abort()
  return { signal: controller.signal, dispose }
}

function drain(response: ServerResponse): Promise<void> {
  if (response.destroyed) return Promise.reject(new Error('HTTP response closed'))
  return new Promise((resolve, reject) => {
    const cleanup = () => {
      response.off('drain', ready)
      response.off('close', closed)
      response.off('error', failed)
    }
    const ready = () => {
      cleanup()
      resolve()
    }
    const closed = () => failed(new Error('HTTP response closed before drain'))
    const failed = (error: Error) => {
      cleanup()
      reject(error)
    }
    response.once('drain', ready)
    response.once('close', closed)
    response.once('error', failed)
  })
}

async function writeStream(source: AsyncIterable<unknown> | Iterable<unknown>, target: ServerResponse): Promise<void> {
  const iterator = Symbol.asyncIterator in source ? source[Symbol.asyncIterator]() : source[Symbol.iterator]()
  let finished = false
  let returning: Promise<unknown> | undefined
  const closeSource = async () => {
    if (finished) return
    returning ??= Promise.resolve().then(() => iterator.return?.())
    await returning
  }
  const disconnected = () => {
    void closeSource().catch(() => {})
  }
  target.once('close', disconnected)
  try {
    while (!target.destroyed && !target.writableEnded) {
      const item = await iterator.next()
      if (item.done) {
        finished = true
        break
      }
      if (target.destroyed || target.writableEnded) break
      if (!(item.value instanceof Uint8Array)) throw new TypeError('Stream chunk must be Uint8Array')
      if (!target.write(item.value)) await drain(target)
    }
    if (!target.destroyed && !target.writableEnded) target.end()
  } finally {
    target.off('close', disconnected)
    await closeSource()
  }
}

async function writeFetch(source: Response, target: ServerResponse, method: string): Promise<void> {
  target.statusCode = source.status
  source.headers.forEach((value, name) => {
    if (name !== 'set-cookie') target.setHeader(name, value)
  })
  const cookies = source.headers.getSetCookie()
  if (cookies.length > 0) target.setHeader('set-cookie', cookies)
  if (source.body === null) {
    target.end()
    return
  }
  if (method === 'HEAD') {
    await source.body.cancel()
    target.end()
    return
  }
  const reader = source.body.getReader()
  const close = () => {
    void reader.cancel().catch(() => {})
  }
  target.once('close', close)
  try {
    async function* chunks() {
      try {
        while (true) {
          const item = await reader.read()
          if (item.done) return
          yield item.value
        }
      } finally {
        await reader.cancel()
      }
    }
    await writeStream(chunks(), target)
  } finally {
    target.off('close', close)
    reader.releaseLock()
  }
}

/** Native response writing; callers retain their host registration and error policy. */
export async function writeNodeResponse(
  source: AdapterResponse,
  target: ServerResponse,
  method: string
): Promise<void> {
  const body = source.body
  if (body.kind === 'raw') {
    if (!(body.value instanceof Response) || body.value.status !== source.status)
      throw new TypeError('Raw Fetch response status must match its declared contract status')
    return writeFetch(body.value, target, method)
  }
  if (body.kind === 'form-data') {
    if (!(body.value instanceof FormData)) throw new TypeError('Form data response body must be FormData')
    return writeFetch(
      new Response(body.value, { status: source.status, headers: toFetchHeaders(source.headers) }),
      target,
      method
    )
  }
  // Prepare JSON before setting headers, so serialization errors can still produce a safe fallback.
  const encoded = body.kind === 'json' ? JSON.stringify(body.value) : undefined
  if (body.kind === 'json' && encoded === undefined)
    throw new TypeError('JSON response body cannot encode to undefined')
  target.statusCode = source.status
  for (const [name, value] of Object.entries(source.headers)) target.setHeader(name, value)
  if (method === 'HEAD' || body.kind === 'empty') {
    if (body.kind === 'stream') {
      const stream = body.value as AsyncIterable<unknown> & Iterable<unknown>
      await (stream[Symbol.asyncIterator]?.() ?? stream[Symbol.iterator]()).return?.()
    }
    target.end()
    return
  }
  switch (body.kind) {
    case 'json':
      target.end(encoded)
      return
    case 'text':
      if (typeof body.value !== 'string') throw new TypeError('Text response body must be a string')
      target.end(body.value)
      return
    case 'bytes':
      if (!(body.value instanceof Uint8Array)) throw new TypeError('Byte response body must be Uint8Array')
      target.end(body.value)
      return
    case 'stream':
      return writeStream(body.value as AsyncIterable<unknown>, target)
  }
}
