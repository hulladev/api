import { decodeWire, encodeWire } from './wire'

export const WEBSOCKET_PROTOCOL = '@hulla/api-websocket/1' as const
export type WebSocketTransportErrorCode = 'closed' | 'invalid-message' | 'remote-error'
export class WebSocketTransportError extends Error {
  readonly code: WebSocketTransportErrorCode
  constructor(code: WebSocketTransportErrorCode, message: string, options?: ErrorOptions) {
    super(message, options)
    this.name = 'WebSocketTransportError'
    this.code = code
  }
}

type SocketEvent = { readonly type: string; readonly data?: unknown }
/** DOM WebSocket and ws both implement this EventTarget surface. The application owns the socket. */
export type WebSocketLike = {
  readonly readyState: number
  send(data: string): void
  addEventListener(type: 'open' | 'message' | 'close' | 'error', listener: (event: SocketEvent) => void): void
  removeEventListener(type: 'open' | 'message' | 'close' | 'error', listener: (event: SocketEvent) => void): void
}
export type Frame = Record<string, unknown> & {
  readonly protocol: typeof WEBSOCKET_PROTOCOL
  readonly type: string
  readonly id?: string
}
export const isRecord = (value: unknown): value is Record<string, unknown> =>
  typeof value === 'object' && value !== null && !Array.isArray(value)

/** Installs listeners immediately and serializes asynchronous frame decoding to preserve message order. */
export function connection(socket: WebSocketLike, receive: (frame: Frame) => void, ended: (error: Error) => void) {
  let resolveClosed!: (reason: Error) => void
  const closed = new Promise<Error>((resolve) => {
    resolveClosed = resolve
  })
  let terminal: Error | undefined
  const opened = socket.readyState === 1
  let resolveReady!: () => void
  let rejectReady!: (reason: unknown) => void
  const ready = new Promise<void>((resolve, reject) => {
    resolveReady = resolve
    rejectReady = reject
  })
  // Consumers may choose to await their first call rather than observing ready explicitly.
  void ready.catch(() => {})
  const open = () => {
    resolveReady()
  }
  const close = () => stop(new WebSocketTransportError('closed', 'WebSocket connection closed'))
  const error = () => stop(new WebSocketTransportError('closed', 'WebSocket connection failed'))
  let decoding = Promise.resolve()
  const message = (event: SocketEvent) => {
    decoding = decoding
      .then(async () => {
        if (terminal) return
        const data = event.data
        const text =
          typeof data === 'string'
            ? data
            : data instanceof Blob
              ? await data.text()
              : data instanceof ArrayBuffer
                ? new TextDecoder('utf-8', { fatal: true }).decode(data)
                : ArrayBuffer.isView(data)
                  ? new TextDecoder('utf-8', { fatal: true }).decode(data)
                  : undefined
        if (text === undefined) throw new TypeError('Unsupported WebSocket frame data')
        const frame = decodeWire(text)
        if (
          !isRecord(frame) ||
          frame['protocol'] !== WEBSOCKET_PROTOCOL ||
          typeof frame['type'] !== 'string' ||
          (frame['type'] !== 'close' && typeof frame['id'] !== 'string')
        )
          throw new TypeError('Invalid WebSocket protocol envelope')
        if (!terminal) receive(frame as Frame)
      })
      .catch((cause: unknown) =>
        stop(new WebSocketTransportError('invalid-message', 'Invalid WebSocket protocol message', { cause }))
      )
  }
  function stop(reason: Error = new WebSocketTransportError('closed', 'WebSocket transport closed')): void {
    if (terminal) return
    terminal = reason
    resolveClosed(reason)
    rejectReady(reason)
    socket.removeEventListener('open', open)
    socket.removeEventListener('message', message)
    socket.removeEventListener('close', close)
    socket.removeEventListener('error', error)
    ended(reason)
  }
  socket.addEventListener('open', open)
  socket.addEventListener('message', message)
  socket.addEventListener('close', close)
  socket.addEventListener('error', error)
  if (opened) resolveReady()
  else if (socket.readyState !== 0) close()
  let writing = Promise.resolve()
  return {
    ready,
    closed,
    stop,
    send(frame: Omit<Frame, 'protocol'>, active: () => boolean = () => true): Promise<void> {
      const operation = writing.then(async () => {
        if (terminal) throw terminal
        await ready
        if (!active()) return
        const encoded = await encodeWire({ ...frame, protocol: WEBSOCKET_PROTOCOL })
        if (terminal) throw terminal
        if (!active()) return
        if (socket.readyState !== 1) {
          close()
          throw terminal
        }
        try {
          socket.send(encoded)
        } catch (cause) {
          stop(new WebSocketTransportError('closed', 'WebSocket send failed', { cause }))
          throw terminal
        }
      })
      writing = operation.catch(() => {})
      return operation
    },
  }
}
export type Connection = ReturnType<typeof connection>
