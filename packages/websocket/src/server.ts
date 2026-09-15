import type { Contract } from '@hulla/api'
import { createAdapterHandler, type AdapterErrorInput, type AdapterResponse } from '@hulla/api/adapters'
import type { ClientTransportRequest } from '@hulla/api/client'
import {
  assertAdapterContext,
  createServerAdapter,
  type Awaitable,
  type ServerAdapter,
  type ServerContextInput,
  type ServerExecutableFor,
} from '@hulla/api/server'
import { connection, isRecord, type Frame, type WebSocketLike } from './connection'

export type WebSocketServerRequest = Omit<ClientTransportRequest, 'signal'> & { readonly signal: AbortSignal }
export type WebSocketAdapterContext = { readonly socket: WebSocketLike; readonly request: WebSocketServerRequest }
export type WebSocketContextInput<ContractType extends Contract = Contract> = ServerContextInput<ContractType> &
  WebSocketAdapterContext
export type WebSocketServerErrorInput = Omit<AdapterErrorInput, 'request'> & WebSocketAdapterContext
export type WebSocketServerOptions = {
  readonly onError?: (input: WebSocketServerErrorInput) => Awaitable<AdapterResponse | undefined | void>
}
export type WebSocketServer = {
  readonly ready: Promise<void>
  readonly closed: Promise<Error>
  readonly close: () => Promise<void>
}
export type WebSocketAdapter = ServerAdapter<'websocket', WebSocketAdapterContext> & {
  readonly mount: <const ContractType extends Contract, const Context extends object>(
    implementation: ServerExecutableFor<ContractType, Context, 'websocket', WebSocketAdapterContext>,
    options?: WebSocketServerOptions
  ) => WebSocketServer
}

type Active = {
  readonly controller: AbortController
  iterator?: AsyncIterator<Uint8Array>
  pulls: number
  pumping: boolean
  cancelled: boolean
}
function requestInput(value: unknown, signal: AbortSignal): WebSocketServerRequest {
  if (
    !isRecord(value) ||
    typeof value['path'] !== 'string' ||
    typeof value['method'] !== 'string' ||
    !Array.isArray(value['key']) ||
    !value['key'].every((part) => typeof part === 'string') ||
    !isRecord(value['headers']) ||
    !Object.values(value['headers']).every((header) => typeof header === 'string')
  )
    throw new TypeError('Invalid WebSocket request')
  if (
    value['body'] !== undefined &&
    (!isRecord(value['body']) ||
      !['json', 'text', 'bytes', 'form-data'].includes(String(value['body']['kind'])) ||
      typeof value['body']['contentType'] !== 'string')
  )
    throw new TypeError('Invalid WebSocket request body')
  return { ...value, signal } as WebSocketServerRequest
}

function mount<const ContractType extends Contract, const Context extends object>(
  socket: WebSocketLike,
  implementation: ServerExecutableFor<ContractType, Context, 'websocket', WebSocketAdapterContext>,
  options: WebSocketServerOptions
): WebSocketServer {
  assertAdapterContext(implementation.context, 'websocket')
  const dispatch = createAdapterHandler(
    implementation,
    options.onError === undefined
      ? {}
      : { onError: (input) => options.onError!({ ...input, request: input.request as WebSocketServerRequest, socket }) }
  )
  const active = new Map<string, Active>()
  let closed = false
  const cleanup = new Set<Promise<void>>()
  const cancel = (id: string, state: Active): Promise<void> => {
    if (state.cancelled) return Promise.resolve()
    state.cancelled = true
    state.controller.abort(new Error('WebSocket call cancelled'))
    active.delete(id)
    const operation = Promise.resolve().then(async () => {
      await state.iterator?.return?.()
    })
    cleanup.add(operation)
    void operation.finally(() => cleanup.delete(operation)).catch(() => {})
    return operation
  }
  const ended = () => {
    closed = true
    for (const [id, state] of active) void cancel(id, state).catch(() => {})
  }
  const fail = (id: string, error: unknown) =>
    link.send({ type: 'error', id, error: error instanceof Error ? error.message : String(error) })
  async function pump(id: string, state: Active): Promise<void> {
    if (state.pumping || !state.iterator) return
    state.pumping = true
    try {
      while (!state.cancelled && state.pulls > 0) {
        state.pulls--
        const chunk = await state.iterator.next()
        if (state.cancelled) break
        if (chunk.done) {
          active.delete(id)
          await link.send({ type: 'end', id })
          return
        }
        if (!(chunk.value instanceof Uint8Array)) throw new TypeError('WebSocket stream chunks must be Uint8Array')
        await link.send({ type: 'chunk', id, chunk: chunk.value })
      }
    } catch (error) {
      await cancel(id, state).catch(() => {})
      if (!closed) await fail(id, error)
    } finally {
      state.pumping = false
    }
  }
  async function execute(frame: Frame): Promise<void> {
    const id = frame.id!
    if (active.has(id)) throw new TypeError('Duplicate WebSocket request ID')
    const state: Active = { controller: new AbortController(), pulls: 0, pumping: false, cancelled: false }
    active.set(id, state)
    try {
      const request = requestInput(frame['request'], state.controller.signal)
      const result = await dispatch({
        request,
        signal: request.signal,
        contextInput: { socket, request },
        hostContext: { socket, request },
        method: request.method,
        pathname: request.path,
        headers: request.headers,
        ...(request.query === undefined ? {} : { query: request.query }),
        ...(request.body === undefined
          ? {}
          : { body: { value: request.body.value, contentType: request.body.contentType } }),
      })
      const wireResult =
        result.body.kind === 'form-data'
          ? { ...result, headers: { ...result.headers, 'content-type': 'multipart/form-data' } }
          : result
      if (result.body.kind === 'stream')
        state.iterator = (result.body.value as AsyncIterable<Uint8Array>)[Symbol.asyncIterator]()
      if (state.cancelled) {
        await state.iterator?.return?.()
        return
      }
      await link.send({
        type: 'response',
        id,
        response: result.body.kind === 'stream' ? { ...wireResult, body: { kind: 'stream' } } : wireResult,
      })
      if (result.body.kind !== 'stream') active.delete(id)
    } catch (error) {
      if (!state.cancelled) {
        await cancel(id, state).catch(() => {})
        if (!closed) await fail(id, error)
      }
    }
  }
  const link = connection(
    socket,
    (frame) => {
      if (frame.type === 'close') {
        link.stop()
        return
      }
      const id = frame.id!
      if (frame.type === 'request') {
        if (active.has(id)) throw new TypeError('Duplicate WebSocket request ID')
        void execute(frame).catch((error: unknown) =>
          link.stop(error instanceof Error ? error : new Error(String(error)))
        )
        return
      }
      const state = active.get(id)
      if (frame.type === 'cancel') {
        if (state) void cancel(id, state).catch(() => {})
        return
      }
      if (frame.type === 'pull') {
        if (state?.iterator) {
          state.pulls++
          void pump(id, state).catch(() => {})
        }
        return
      }
      throw new TypeError('Unexpected WebSocket client message')
    },
    ended
  )
  return {
    ready: link.ready,
    closed: link.closed,
    async close() {
      if (!closed && socket.readyState === 1) await link.send({ type: 'close' }).catch(() => {})
      link.stop()
      await Promise.allSettled([...cleanup])
    },
  }
}

/** Mount once per accepted socket; the application owns upgrades, authentication and socket lifetime. */
export function webSocketAdapter(socket: WebSocketLike, defaults: WebSocketServerOptions = {}): WebSocketAdapter {
  const configured = { ...defaults }
  return createServerAdapter('websocket', {
    mount: <const ContractType extends Contract, const Context extends object>(
      implementation: ServerExecutableFor<ContractType, Context, 'websocket', WebSocketAdapterContext>,
      options?: WebSocketServerOptions
    ) => mount(socket, implementation, { ...configured, ...options }),
  }) as unknown as WebSocketAdapter
}
