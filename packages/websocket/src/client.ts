import type { ResponseHeaderValues } from '@hulla/api'
import type { ClientTransport, ClientTransportRequest, ClientTransportResponse } from '@hulla/api/client'
import {
  connection,
  isRecord,
  WebSocketTransportError,
  type Connection,
  type Frame,
  type WebSocketLike,
} from './connection'

export type WebSocketTransport = ClientTransport & {
  readonly ready: Promise<void>
  readonly closed: Promise<Error>
  /** Rejects active calls and releases listeners without closing the application's socket. */
  readonly close: () => Promise<void>
}

type Pending = {
  resolve: (response: ClientTransportResponse) => void
  reject: (reason: unknown) => void
  cleanup: () => void
  readonly signal: AbortSignal | undefined
}

class RemoteStream implements AsyncIterableIterator<Uint8Array> {
  #done = false
  #failed = false
  #error: unknown
  #waiters: { resolve: (value: IteratorResult<Uint8Array>) => void; reject: (reason: unknown) => void }[] = []
  constructor(
    readonly link: Connection,
    readonly id: string,
    readonly finish: () => void
  ) {}
  [Symbol.asyncIterator](): AsyncIterableIterator<Uint8Array> {
    return this
  }
  next(): Promise<IteratorResult<Uint8Array>> {
    if (this.#failed) return Promise.reject(this.#error)
    if (this.#done) return Promise.resolve({ done: true, value: undefined })
    const pending = new Promise<IteratorResult<Uint8Array>>((resolve, reject) =>
      this.#waiters.push({ resolve, reject })
    )
    void this.link.send({ type: 'pull', id: this.id }).catch((error: unknown) => this.fail(error))
    return pending
  }
  async return(): Promise<IteratorResult<Uint8Array>> {
    if (!this.#done) {
      this.end()
      await this.link.send({ type: 'cancel', id: this.id }).catch(() => {})
    }
    return { done: true, value: undefined }
  }
  chunk(value: unknown): void {
    const waiter = this.#waiters.shift()
    if (!(value instanceof Uint8Array) || !waiter) {
      const error = new WebSocketTransportError('invalid-message', 'Unsolicited or invalid WebSocket stream chunk')
      waiter?.reject(error)
      this.fail(error)
      void this.link.send({ type: 'cancel', id: this.id }).catch(() => {})
      return
    }
    waiter.resolve({ done: false, value })
  }
  end(): void {
    if (this.#done) return
    this.#done = true
    this.finish()
    for (const waiter of this.#waiters.splice(0)) waiter.resolve({ done: true, value: undefined })
  }
  fail(error: unknown): void {
    if (this.#done) return
    this.#failed = true
    this.#error = error
    this.#done = true
    this.finish()
    for (const waiter of this.#waiters.splice(0)) waiter.reject(error)
  }
}

function headers(value: unknown): value is ResponseHeaderValues {
  return (
    isRecord(value) &&
    Object.values(value).every(
      (field) => typeof field === 'string' || (Array.isArray(field) && field.every((item) => typeof item === 'string'))
    )
  )
}
const remoteError = (frame: Frame) =>
  new WebSocketTransportError(
    'remote-error',
    typeof frame['error'] === 'string' ? frame['error'] : 'Remote WebSocket operation failed'
  )

export function webSocketTransport(socket: WebSocketLike): WebSocketTransport {
  const pending = new Map<string, Pending>()
  const streams = new Map<string, RemoteStream>()
  let terminal: Error | undefined
  let sequence = 0
  const prefix =
    globalThis.crypto?.randomUUID?.() ?? `${Date.now().toString(36)}-${Math.random().toString(36).slice(2)}`
  const ended = (error: Error) => {
    terminal = error
    for (const request of pending.values()) {
      request.cleanup()
      request.reject(error)
    }
    pending.clear()
    for (const stream of [...streams.values()]) stream.fail(error)
  }
  const link = connection(
    socket,
    (frame) => {
      if (frame.type === 'close') {
        link.stop(new WebSocketTransportError('closed', 'Remote WebSocket server closed'))
        return
      }
      const id = frame.id!
      const stream = streams.get(id)
      if (stream) {
        if (frame.type === 'chunk') stream.chunk(frame['chunk'])
        else if (frame.type === 'end') stream.end()
        else if (frame.type === 'error') stream.fail(remoteError(frame))
        else throw new TypeError('Unexpected WebSocket stream message')
        return
      }
      const request = pending.get(id)
      if (!request) return // A cancelled call may still have an in-flight response.
      if (frame.type === 'error') {
        pending.delete(id)
        request.cleanup()
        request.reject(remoteError(frame))
        return
      }
      const value = frame['response']
      if (
        frame.type !== 'response' ||
        !isRecord(value) ||
        !Number.isInteger(value['status']) ||
        !headers(value['headers']) ||
        !isRecord(value['body']) ||
        !['json', 'text', 'bytes', 'form-data', 'empty', 'raw', 'stream'].includes(String(value['body']['kind']))
      )
        throw new TypeError('Invalid WebSocket response')
      const body = value['body']
      pending.delete(id)
      request.cleanup()
      let remote: RemoteStream | undefined
      if (body['kind'] === 'stream') {
        const abort = () => {
          remote!.fail(request.signal?.reason)
          void link.send({ type: 'cancel', id }).catch(() => {})
        }
        remote = new RemoteStream(link, id, () => {
          streams.delete(id)
          request.signal?.removeEventListener('abort', abort)
        })
        streams.set(id, remote)
        request.signal?.addEventListener('abort', abort, { once: true })
        if (request.signal?.aborted) abort()
      }
      request.resolve({
        status: value['status'] as number,
        headers: value['headers'],
        native: frame,
        dispose: async () => {
          await remote?.return()
        },
        readBody: (kind) => {
          if (body['kind'] !== kind) {
            void remote?.return()
            throw new WebSocketTransportError(
              'invalid-message',
              `Expected ${kind} WebSocket body, received ${String(body['kind'])}`
            )
          }
          return remote ?? body['value']
        },
      })
    },
    ended
  )
  const transport = (async (request: ClientTransportRequest): Promise<ClientTransportResponse> => {
    if (terminal) throw terminal
    request.signal?.throwIfAborted()
    // An abort while connecting must settle the call immediately and must never replay it on open.
    await new Promise<void>((resolve, reject) => {
      const abort = () => {
        request.signal?.removeEventListener('abort', abort)
        reject(request.signal?.reason)
      }
      request.signal?.addEventListener('abort', abort, { once: true })
      void link.ready.then(resolve, reject).finally(() => request.signal?.removeEventListener('abort', abort))
      if (request.signal?.aborted) abort()
    })
    if (terminal) throw terminal
    request.signal?.throwIfAborted()
    const id = `${prefix}:${++sequence}`
    return new Promise<ClientTransportResponse>((resolve, reject) => {
      const abort = () => {
        const active = pending.get(id)
        if (!active) return
        pending.delete(id)
        active.cleanup()
        reject(request.signal?.reason)
        void link.send({ type: 'cancel', id }).catch(() => {})
      }
      pending.set(id, {
        resolve,
        reject,
        signal: request.signal,
        cleanup: () => request.signal?.removeEventListener('abort', abort),
      })
      request.signal?.addEventListener('abort', abort, { once: true })
      const { signal: _signal, ...input } = request
      void link
        .send({ type: 'request', id, request: input }, () => pending.has(id))
        .catch((error: unknown) => {
          const active = pending.get(id)
          if (active) {
            pending.delete(id)
            active.cleanup()
            reject(error)
          }
        })
    })
  }) as unknown as WebSocketTransport
  Object.defineProperties(transport, {
    ready: { enumerable: true, value: link.ready },
    closed: { enumerable: true, value: link.closed },
    close: {
      enumerable: true,
      value: async () => {
        if (!terminal && socket.readyState === 1) await link.send({ type: 'close' }).catch(() => {})
        link.stop()
      },
    },
  })
  return transport
}
