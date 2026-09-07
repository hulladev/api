import type { ResponseHeaderValues } from '@hulla/api'
import type { ClientTransport, ClientTransportRequest, ClientTransportResponse } from '@hulla/api/client'
import { decodeMessagePortFormData, encodeRequestBody } from './body'
import { resolveMessageEndpoint, type MessageEndpoint, type MessagePortLike } from './endpoint'
import { isRecord } from './object'
import {
  DEFAULT_MESSAGE_PORT_CHANNEL,
  MESSAGE_PORT_PROTOCOL_VERSION,
  isMessagePortEnvelope,
  type MessagePortBody,
  type MessagePortMessage,
  type MessagePortResponseMessage,
} from './protocol'

export type MessagePortTransportOptions = {
  readonly channel?: string
}

export type MessagePortTransport = ClientTransport & {
  /** Resolves after the endpoint listener has been installed. */
  readonly ready: Promise<void>
  /** Stops listening and rejects all unfinished calls. The underlying endpoint remains open. */
  readonly close: () => Promise<void>
}

export type MessagePortTransportErrorCode = 'closed' | 'invalid-message' | 'remote-error'

export class MessagePortTransportError extends Error {
  readonly code: MessagePortTransportErrorCode

  constructor(code: MessagePortTransportErrorCode, message: string, options?: ErrorOptions) {
    super(message, options)
    this.name = 'MessagePortTransportError'
    this.code = code
  }
}

type PendingRequest = {
  readonly resolve: (response: ClientTransportResponse) => void
  readonly reject: (error: unknown) => void
  readonly signal?: AbortSignal
  readonly onAbort?: () => void
  cancel: (error?: unknown) => void
}

function channelName(options: MessagePortTransportOptions): string {
  const channel = options.channel ?? DEFAULT_MESSAGE_PORT_CHANNEL
  if (channel.length === 0) throw new TypeError('Message-port channel must not be empty')
  return channel
}

function requestIdFactory(): () => string {
  const prefix =
    globalThis.crypto?.randomUUID?.() ?? `${Date.now().toString(36)}-${Math.random().toString(36).slice(2)}`
  let sequence = 0
  return () => `${prefix}:${++sequence}`
}

function remoteError(value: unknown, fallback: string): MessagePortTransportError {
  const error = isRecord(value) ? value : undefined
  const message = typeof error?.['message'] === 'string' ? error['message'] : fallback
  const name = typeof error?.['name'] === 'string' ? error['name'] : undefined
  return new MessagePortTransportError('remote-error', name === undefined ? message : `${name}: ${message}`)
}

function stringHeaders(value: unknown): value is ResponseHeaderValues {
  return (
    isRecord(value) &&
    Object.values(value).every(
      (field) => typeof field === 'string' || (Array.isArray(field) && field.every((item) => typeof item === 'string'))
    )
  )
}

function responseBody(value: unknown): MessagePortBody | undefined {
  if (!isRecord(value) || typeof value['kind'] !== 'string') return undefined
  switch (value['kind']) {
    case 'empty':
    case 'stream':
      return { kind: value['kind'] }
    case 'bytes':
      return value['value'] instanceof Uint8Array ? { kind: 'bytes', value: value['value'] } : undefined
    case 'text':
      return typeof value['value'] === 'string' ? { kind: 'text', value: value['value'] } : undefined
    case 'form-data':
      return Array.isArray(value['value']) ? (value as MessagePortBody) : undefined
    case 'json':
    case 'raw':
      return { kind: value['kind'], value: value['value'] }
    default:
      return undefined
  }
}

class MessagePortRemoteStream implements AsyncIterable<Uint8Array>, AsyncIterator<Uint8Array> {
  readonly #channel: string
  readonly #endpoint: MessageEndpoint
  readonly #id: string
  readonly #onFinish: () => void
  readonly #waiters: Array<{
    readonly resolve: (result: IteratorResult<Uint8Array>) => void
    readonly reject: (error: unknown) => void
  }> = []
  #finished = false

  constructor(endpoint: MessageEndpoint, channel: string, id: string, onFinish: () => void) {
    this.#endpoint = endpoint
    this.#channel = channel
    this.#id = id
    this.#onFinish = onFinish
  }

  next(): Promise<IteratorResult<Uint8Array>> {
    if (this.#finished) return Promise.resolve({ done: true, value: undefined })
    const result = new Promise<IteratorResult<Uint8Array>>((resolve, reject) => {
      this.#waiters.push({ resolve, reject })
    })
    try {
      void Promise.resolve(
        this.#endpoint.send({
          protocol: MESSAGE_PORT_PROTOCOL_VERSION,
          channel: this.#channel,
          type: 'stream-pull',
          id: this.#id,
        })
      ).catch((error: unknown) => this.fail(error))
    } catch (error) {
      this.fail(error)
    }
    return result
  }

  return(): Promise<IteratorResult<Uint8Array>> {
    if (!this.#finished) {
      this.#sendDetached({
        protocol: MESSAGE_PORT_PROTOCOL_VERSION,
        channel: this.#channel,
        type: 'cancel',
        id: this.#id,
      })
      this.end()
    }
    return Promise.resolve({ done: true, value: undefined })
  }

  abort(error: unknown): void {
    if (this.#finished) return
    this.#sendDetached({
      protocol: MESSAGE_PORT_PROTOCOL_VERSION,
      channel: this.#channel,
      type: 'cancel',
      id: this.#id,
    })
    this.fail(error)
  }

  [Symbol.asyncIterator](): AsyncIterator<Uint8Array> {
    return this
  }

  #sendDetached(message: MessagePortMessage): void {
    try {
      void Promise.resolve(this.#endpoint.send(message)).catch(() => {})
    } catch {
      // Stream cancellation is best-effort after the local consumer has stopped.
    }
  }

  chunk(value: unknown): void {
    if (this.#finished) return
    if (!(value instanceof Uint8Array)) {
      this.abort(new MessagePortTransportError('invalid-message', 'Received a non-binary stream chunk'))
      return
    }
    const waiter = this.#waiters.shift()
    if (waiter === undefined) {
      this.abort(new MessagePortTransportError('invalid-message', 'Received an unrequested stream chunk'))
      return
    }
    waiter.resolve({ done: false, value })
  }

  end(): void {
    if (this.#finished) return
    this.#finished = true
    for (const waiter of this.#waiters.splice(0)) waiter.resolve({ done: true, value: undefined })
    this.#onFinish()
  }

  fail(error: unknown): void {
    if (this.#finished) return
    this.#finished = true
    for (const waiter of this.#waiters.splice(0)) waiter.reject(error)
    this.#onFinish()
  }
}

/** Creates a concurrent request transport over a MessagePort or custom ordered IPC endpoint. */
export function messagePortTransport(
  port: MessagePortLike | MessageEndpoint,
  options: MessagePortTransportOptions = {}
): MessagePortTransport {
  const endpoint = resolveMessageEndpoint(port)
  const channel = channelName(options)
  const nextRequestId = requestIdFactory()
  const pending = new Map<string, PendingRequest>()
  const streams = new Map<string, MessagePortRemoteStream>()
  let closed = false
  let unsubscribe: (() => void | PromiseLike<void>) | undefined

  const sendDetached = (message: MessagePortMessage): void => {
    try {
      void Promise.resolve(endpoint.send(message)).catch(() => {})
    } catch {
      // There is no useful recipient for fire-and-forget cancellation failures.
    }
  }

  const clearPending = (id: string, request: PendingRequest): void => {
    pending.delete(id)
    if (request.signal !== undefined && request.onAbort !== undefined) {
      request.signal.removeEventListener('abort', request.onAbort)
    }
  }

  const failAll = (error: unknown, notifyRemote: boolean): void => {
    for (const [id, request] of [...pending]) {
      if (notifyRemote) request.cancel(error)
      else {
        clearPending(id, request)
        request.reject(error)
      }
    }
    for (const stream of [...streams.values()]) {
      if (notifyRemote) stream.abort(error)
      else stream.fail(error)
    }
    streams.clear()
  }

  const receive = (value: unknown): void => {
    if (!isMessagePortEnvelope(value, channel)) return
    if (value.type === 'close') {
      closed = true
      failAll(new MessagePortTransportError('closed', 'The remote message-port server closed'), false)
      const cleanup = unsubscribe
      unsubscribe = undefined
      if (cleanup !== undefined) void Promise.resolve(cleanup()).catch(() => {})
      return
    }
    if (typeof value.id !== 'string') return

    const stream = streams.get(value.id)
    if (stream !== undefined) {
      if (value.type === 'stream-chunk') stream.chunk(value.chunk)
      else if (value.type === 'stream-end') stream.end()
      else if (value.type === 'stream-error') stream.fail(remoteError(value.error, 'Remote stream failed'))
      return
    }

    const request = pending.get(value.id)
    if (request === undefined) return
    if (value.type === 'error') {
      clearPending(value.id, request)
      request.reject(remoteError(value.error, 'Remote request failed'))
      return
    }
    if (value.type !== 'response') return

    const responseValue = value.response
    const body = isRecord(responseValue) ? responseBody(responseValue['body']) : undefined
    if (
      !isRecord(responseValue) ||
      typeof responseValue['status'] !== 'number' ||
      !stringHeaders(responseValue['headers']) ||
      body === undefined
    ) {
      clearPending(value.id, request)
      request.reject(new MessagePortTransportError('invalid-message', 'Received an invalid response message'))
      return
    }

    pending.delete(value.id)
    let streamAbort: (() => void) | undefined
    const finish = () => {
      streams.delete(value.id)
      const abortListener = streamAbort ?? request.onAbort
      if (request.signal !== undefined && abortListener !== undefined) {
        request.signal.removeEventListener('abort', abortListener)
      }
    }
    const remoteStream =
      body.kind === 'stream' ? new MessagePortRemoteStream(endpoint, channel, value.id, finish) : undefined
    if (remoteStream === undefined) finish()
    else {
      streams.set(value.id, remoteStream)
      if (request.signal !== undefined) {
        if (request.onAbort !== undefined) request.signal.removeEventListener('abort', request.onAbort)
        streamAbort = () => remoteStream.abort(request.signal?.reason)
        request.signal.addEventListener('abort', streamAbort, { once: true })
        if (request.signal.aborted) streamAbort()
      }
    }

    const response: ClientTransportResponse = {
      status: responseValue['status'],
      headers: responseValue['headers'],
      native: value as MessagePortResponseMessage,
      dispose: async () => {
        await remoteStream?.return()
      },
      readBody: (kind) => {
        if (body.kind !== kind) {
          remoteStream?.return()
          throw new TypeError(`Message-port response body is ${body.kind}, but the client selected ${kind}`)
        }
        if (body.kind === 'stream') return remoteStream!
        if (body.kind === 'form-data') return decodeMessagePortFormData(body.value)
        return body.value
      },
    }
    request.resolve(response)
  }

  const ready = Promise.resolve(endpoint.subscribe(receive)).then(async (subscription) => {
    unsubscribe = subscription
    if (closed) {
      unsubscribe = undefined
      await subscription()
    }
  })

  const transport = (async (request: ClientTransportRequest): Promise<ClientTransportResponse> => {
    if (closed) throw new MessagePortTransportError('closed', 'Message-port transport is closed')
    request.signal?.throwIfAborted()
    await ready
    request.signal?.throwIfAborted()

    const id = nextRequestId()
    const encodedRequest = {
      key: request.key,
      method: request.method,
      path: request.path,
      ...(request.query === undefined ? {} : { query: request.query }),
      headers: request.headers,
      ...(request.body === undefined ? {} : { body: await encodeRequestBody(request.body) }),
    }
    if (closed) throw new MessagePortTransportError('closed', 'Message-port transport is closed')
    request.signal?.throwIfAborted()

    return new Promise<ClientTransportResponse>((resolve, reject) => {
      const cancel = (error: unknown = request.signal?.reason) => {
        const active = pending.get(id)
        if (active === undefined) return
        clearPending(id, active)
        sendDetached({ protocol: MESSAGE_PORT_PROTOCOL_VERSION, channel, type: 'cancel', id })
        reject(error)
      }
      const onAbort = () => cancel(request.signal?.reason)
      const active: PendingRequest = {
        resolve,
        reject,
        ...(request.signal === undefined ? {} : { signal: request.signal, onAbort }),
        cancel,
      }
      pending.set(id, active)
      request.signal?.addEventListener('abort', onAbort, { once: true })
      if (request.signal?.aborted) {
        cancel()
        return
      }

      const message: MessagePortMessage = {
        protocol: MESSAGE_PORT_PROTOCOL_VERSION,
        channel,
        type: 'request',
        id,
        request: encodedRequest,
      }
      try {
        void Promise.resolve(endpoint.send(message)).catch((error: unknown) => {
          if (pending.get(id) !== active) return
          clearPending(id, active)
          reject(error)
        })
      } catch (error) {
        clearPending(id, active)
        reject(error)
      }
    })
  }) as unknown as MessagePortTransport

  Object.defineProperties(transport, {
    ready: { value: ready, enumerable: true },
    close: {
      enumerable: true,
      value: async () => {
        if (!closed) {
          closed = true
          failAll(new MessagePortTransportError('closed', 'Message-port transport is closed'), true)
        }
        await ready
        const cleanup = unsubscribe
        unsubscribe = undefined
        await cleanup?.()
      },
    },
  })

  return transport
}
