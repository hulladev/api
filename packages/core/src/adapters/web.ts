import type { ExecutionStep } from '../execution'
import { readBodyBytes, readableBytes } from './body'
import { errorResponse } from './errors'
import { toFetchHeaders } from './headers'
import type { AdapterResponse } from './types'

export function readFetchBody(
  request: Request,
  representation: string,
  preserveRequest: boolean,
  limit: number
): Promise<unknown> {
  try {
    const source = preserveRequest ? request.clone() : request
    if (limit === Infinity) {
      switch (representation) {
        case 'json':
          return source.json()
        case 'text':
          return source.text()
        case 'bytes':
          return source.arrayBuffer().then((buffer) => new Uint8Array(buffer))
        case 'form-data':
          return source.formData()
      }
    }
    return readBoundedFetchBody(source, representation, limit)
  } catch (error) {
    return Promise.reject(error)
  }
}

async function readBoundedFetchBody(source: Request, representation: string, limit: number): Promise<unknown> {
  const bytes = source.body === null ? new Uint8Array() : await readBodyBytes(readableBytes(source.body), limit)
  switch (representation) {
    case 'json':
      return JSON.parse(new TextDecoder().decode(bytes)) as unknown
    case 'text':
      return new TextDecoder().decode(bytes)
    case 'bytes':
      return bytes
    case 'form-data':
      return new Response(bytes as BodyInit, { headers: source.headers }).formData()
    default:
      throw new TypeError(`Unsupported Fetch request body representation ${representation}`)
  }
}

function readableStream(source: unknown, onError?: (error: unknown) => Promise<void>): ReadableStream<Uint8Array> {
  const stream = source as AsyncIterable<unknown> & Iterable<unknown>
  const iterator =
    typeof stream[Symbol.asyncIterator] === 'function' ? stream[Symbol.asyncIterator]() : stream[Symbol.iterator]()
  return new ReadableStream<Uint8Array>({
    async pull(controller) {
      try {
        const result = await iterator.next()
        if (result.done) controller.close()
        else if (result.value instanceof Uint8Array) controller.enqueue(result.value)
        else throw new TypeError('Stream chunk must be Uint8Array')
      } catch (error) {
        try {
          await iterator.return?.()
        } catch {
          /* Keep the producer error. */
        }
        await onError?.(error)
        controller.error(error)
      }
    },
    async cancel(reason) {
      await iterator.return?.(reason)
    },
  })
}

type FetchBodyKind = Exclude<AdapterResponse['body']['kind'], 'json' | 'raw'>

function responseBody(
  kind: FetchBodyKind,
  value: unknown,
  onError?: (error: unknown) => Promise<void>
): BodyInit | null {
  switch (kind) {
    case 'empty':
      return null
    case 'text':
      if (typeof value !== 'string') throw new TypeError('Text adapter response body must be a string')
      return value
    case 'bytes':
      if (!(value instanceof Uint8Array)) throw new TypeError('Byte adapter response body must be Uint8Array')
      return value as BodyInit
    case 'form-data':
      if (!(value instanceof FormData)) throw new TypeError('Form data response body must be FormData')
      return value
    case 'stream':
      return readableStream(value, onError) as unknown as BodyInit
  }
}

export function toFetchResponse(response: AdapterResponse, onError?: (error: unknown) => Promise<void>): Response {
  const body = response.body
  if (body.kind === 'raw') {
    if (!(body.value instanceof Response) || body.value.status !== response.status) {
      throw new TypeError('Raw Fetch response status must match its declared contract status')
    }
    return body.value
  }
  if (body.kind === 'json') {
    if (body.value === undefined) throw new TypeError('JSON response body cannot encode to undefined')
    return Response.json(body.value, { status: response.status, headers: toFetchHeaders(response.headers) })
  }
  const fetchResponse = new Response(responseBody(body.kind, body.value, onError), {
    status: response.status,
    headers: toFetchHeaders(response.headers),
  })
  if (body.kind === 'form-data') void fetchResponse.headers.get('content-type')
  return fetchResponse
}

export type FetchWriteError = {
  readonly error: unknown
  readonly phase: 'transport'
  readonly defaultResponse: Response
}

/** Before commitment errors can replace a response; after commitment the hook only observes. */
export function writeFetchResponseStep(
  source: AdapterResponse,
  onError?: (input: FetchWriteError) => unknown
): ExecutionStep<Response> {
  const failed = async (error: unknown, committed: boolean): Promise<Response> => {
    const fallback = toFetchResponse(errorResponse(error, 'transport'))
    let replacement: unknown
    try {
      replacement = await onError?.({ error, phase: 'transport', defaultResponse: fallback.clone() })
    } catch {
      /* Do not recursively call the observer. */
    }
    const result = replacement instanceof Response ? replacement : fallback
    if (committed && result.body !== null && !result.body.locked) void result.body.cancel().catch(() => {})
    return result
  }
  try {
    return toFetchResponse(source, async (error) => {
      await failed(error, true)
    })
  } catch (error) {
    return failed(error, false)
  }
}

/** Keeps the public writer Promise-based while internal Fetch composition stays synchronous. */
export function writeFetchResponse(
  source: AdapterResponse,
  onError?: (input: FetchWriteError) => unknown
): Promise<Response> {
  return Promise.resolve(writeFetchResponseStep(source, onError))
}
