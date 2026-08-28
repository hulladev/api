import { createAdapterHandler } from '../adapters/runtime'
import type { AdapterErrorInput, AdapterResponse } from '../adapters/types'
import type { ClientTransportRequest } from '../client/request'
import type { Awaitable } from '../context'
import type { Contract } from '../contract'
import { isRecord } from '../object'
import {
  assertAdapterContext,
  createServerAdapter,
  serverContextAdapterId,
  type ServerAdapter,
  type ServerContextInput,
} from '../server/context'
import type { ServerExecutableFor } from '../server/types'
import { decodeMessagePortFormData, encodeResponseBody } from './body'
import { resolveMessageEndpoint, type MessageEndpoint, type MessagePortLike } from './endpoint'
import {
  DEFAULT_MESSAGE_PORT_CHANNEL,
  MESSAGE_PORT_PROTOCOL_VERSION,
  isMessagePortEnvelope,
  messagePortError,
  type MessagePortMessage,
  type MessagePortRequestMessage,
} from './protocol'

export type MessagePortServerRequest = Omit<ClientTransportRequest, 'signal'> & {
  readonly signal: AbortSignal
}

type MessagePortAdapterContext = {
  readonly endpoint: MessageEndpoint
  readonly message: MessagePortRequestMessage
  readonly port: MessagePortLike | MessageEndpoint
  readonly request: MessagePortServerRequest
}

export type MessagePortContextInput<ContractType extends Contract = Contract> = ServerContextInput<ContractType> &
  MessagePortAdapterContext

export type MessagePortServerErrorInput = Omit<AdapterErrorInput, 'request'> & {
  readonly request: MessagePortServerRequest
}

export type MessagePortAdapterOptions = {
  readonly channel?: string
}

export type MessagePortMountOptions = {
  readonly onError?: ((input: MessagePortServerErrorInput) => Awaitable<AdapterResponse | undefined | void>) | undefined
}

export type MessagePortServer = {
  /** Resolves after the endpoint listener has been installed. */
  readonly ready: Promise<void>
  /** Stops listening and cancels active handlers and streams. The underlying endpoint remains open. */
  readonly close: () => Promise<void>
}

export type MessagePortAdapter = ServerAdapter<'message-port', MessagePortAdapterContext> & {
  readonly mount: <const ContractType extends Contract, const Context extends object>(
    implementation: ServerExecutableFor<ContractType, Context, 'message-port', MessagePortAdapterContext>,
    options?: MessagePortMountOptions
  ) => MessagePortServer
}

type ActiveRequest = {
  readonly controller: AbortController
  iterator?: AsyncIterator<Uint8Array>
  cancelled: boolean
  pulls: number
  pumping: boolean
}

function channelName(options: MessagePortAdapterOptions): string {
  const channel = options.channel ?? DEFAULT_MESSAGE_PORT_CHANNEL
  if (channel.length === 0) throw new TypeError('Message-port channel must not be empty')
  return channel
}

function requestHeaders(value: unknown): value is Record<string, string> {
  return isRecord(value) && Object.values(value).every((field) => typeof field === 'string')
}

function decodeRequest(message: MessagePortRequestMessage, signal: AbortSignal): MessagePortServerRequest {
  const request = message.request
  if (
    !isRecord(request) ||
    !Array.isArray(request['key']) ||
    !request['key'].every((part: unknown) => typeof part === 'string') ||
    typeof request['method'] !== 'string' ||
    typeof request['path'] !== 'string' ||
    !requestHeaders(request['headers'])
  ) {
    throw new TypeError('Received an invalid message-port request')
  }

  const body = request['body']
  let decodedBody: ClientTransportRequest['body']
  if (body !== undefined) {
    if (!isRecord(body) || typeof body['contentType'] !== 'string') {
      throw new TypeError('Received an invalid message-port request body')
    }
    switch (body['kind']) {
      case 'bytes':
        if (!(body['value'] instanceof Uint8Array)) throw new TypeError('Message-port byte body must be Uint8Array')
        decodedBody = { kind: 'bytes', contentType: body['contentType'], value: body['value'] }
        break
      case 'text':
        if (typeof body['value'] !== 'string') throw new TypeError('Message-port text body must be a string')
        decodedBody = { kind: 'text', contentType: body['contentType'], value: body['value'] }
        break
      case 'json':
        decodedBody = { kind: 'json', contentType: body['contentType'], value: body['value'] }
        break
      case 'form-data':
        if (!Array.isArray(body['value'])) throw new TypeError('Message-port form data body must contain entries')
        decodedBody = {
          kind: 'form-data',
          contentType: body['contentType'],
          value: decodeMessagePortFormData(body['value'] as never),
        }
        break
      default:
        throw new TypeError('Received an unsupported message-port request body')
    }
  }

  return {
    key: request['key'] as readonly string[],
    method: request['method'],
    path: request['path'],
    ...(request['query'] === undefined ? {} : { query: request['query'] as never }),
    headers: request['headers'],
    ...(decodedBody === undefined ? {} : { body: decodedBody }),
    signal,
  }
}

function streamIterator(value: unknown): AsyncIterator<Uint8Array> {
  const source = value as AsyncIterable<Uint8Array> & Iterable<Uint8Array>
  if (typeof source[Symbol.asyncIterator] === 'function') return source[Symbol.asyncIterator]()
  const iterator = source[Symbol.iterator]()
  return {
    next: async () => iterator.next(),
    ...(iterator.return === undefined ? {} : { return: async () => iterator.return!() }),
  }
}

function createMessagePortServer<const ContractType extends Contract, const Context extends object>(
  port: MessagePortLike | MessageEndpoint,
  endpoint: MessageEndpoint,
  channel: string,
  implementation: ServerExecutableFor<ContractType, Context, 'message-port', MessagePortAdapterContext>,
  options: MessagePortMountOptions
): MessagePortServer {
  assertAdapterContext(implementation.context, 'message-port')
  const usesNativeContext = serverContextAdapterId(implementation.context) !== undefined
  const dispatch = createAdapterHandler(
    implementation,
    options.onError === undefined
      ? {}
      : {
          onError: (input) => options.onError?.({ ...input, request: input.request as MessagePortServerRequest }),
        }
  )
  const active = new Map<string, ActiveRequest>()
  let closed = false
  let unsubscribe: (() => void | PromiseLike<void>) | undefined

  const send = (message: MessagePortMessage): Promise<void> =>
    closed ? Promise.resolve() : Promise.resolve(endpoint.send(message))

  const cancel = async (id: string, request: ActiveRequest): Promise<void> => {
    if (request.cancelled) return
    request.cancelled = true
    request.controller.abort()
    active.delete(id)
    await request.iterator?.return?.()
  }

  const pump = async (id: string, request: ActiveRequest): Promise<void> => {
    if (request.pumping || request.iterator === undefined) return
    request.pumping = true
    try {
      while (!request.cancelled && request.pulls > 0) {
        request.pulls--
        const result = await request.iterator.next()
        if (request.cancelled) break
        if (result.done) {
          active.delete(id)
          await send({ protocol: MESSAGE_PORT_PROTOCOL_VERSION, channel, type: 'stream-end', id })
          return
        }
        if (!(result.value instanceof Uint8Array)) throw new TypeError('Message-port stream chunks must be Uint8Array')
        await send({
          protocol: MESSAGE_PORT_PROTOCOL_VERSION,
          channel,
          type: 'stream-chunk',
          id,
          chunk: result.value,
        })
      }
    } catch (error) {
      active.delete(id)
      await send({
        protocol: MESSAGE_PORT_PROTOCOL_VERSION,
        channel,
        type: 'stream-error',
        id,
        error: messagePortError(error),
      })
    } finally {
      request.pumping = false
    }
  }

  const execute = async (message: MessagePortRequestMessage): Promise<void> => {
    const id = message.id
    if (active.has(id)) {
      await send({
        protocol: MESSAGE_PORT_PROTOCOL_VERSION,
        channel,
        type: 'error',
        id,
        error: { message: 'Duplicate message-port request id' },
      })
      return
    }

    const state: ActiveRequest = {
      controller: new AbortController(),
      cancelled: false,
      pulls: 0,
      pumping: false,
    }
    active.set(id, state)

    try {
      const request = decodeRequest(message, state.controller.signal)
      const response = await dispatch({
        request,
        ...(usesNativeContext ? { contextInput: { endpoint, message, port, request } } : {}),
        method: request.method,
        pathname: request.path,
        headers: request.headers,
        ...(request.query === undefined ? {} : { query: request.query }),
        ...(request.body === undefined
          ? {}
          : { body: { value: request.body.value, contentType: request.body.contentType } }),
      })
      if (state.cancelled) return

      if (response.body.kind === 'stream') state.iterator = streamIterator(response.body.value)
      const body = await encodeResponseBody(response.body)
      if (state.cancelled) return
      await send({
        protocol: MESSAGE_PORT_PROTOCOL_VERSION,
        channel,
        type: 'response',
        id,
        response: {
          status: response.status,
          headers:
            response.body.kind === 'form-data' && response.headers['content-type'] === undefined
              ? { ...response.headers, 'content-type': 'multipart/form-data' }
              : response.headers,
          body,
        },
      })
      if (response.body.kind !== 'stream') active.delete(id)
    } catch (error) {
      active.delete(id)
      if (state.cancelled) return
      await send({
        protocol: MESSAGE_PORT_PROTOCOL_VERSION,
        channel,
        type: 'error',
        id,
        error: messagePortError(error),
      })
    }
  }

  const receive = (value: unknown): void => {
    if (!isMessagePortEnvelope(value, channel) || value.type === 'close') return
    if (typeof value.id !== 'string') return
    if (value.type === 'request') {
      void execute(value).catch(() => {})
      return
    }
    const request = active.get(value.id)
    if (request === undefined) return
    if (value.type === 'cancel') void cancel(value.id, request).catch(() => {})
    else if (value.type === 'stream-pull' && request.iterator !== undefined) {
      request.pulls++
      void pump(value.id, request).catch(() => {})
    }
  }

  const ready = Promise.resolve(endpoint.subscribe(receive)).then((subscription) => {
    unsubscribe = subscription
    if (closed) return subscription()
  })

  return Object.freeze({
    ready,
    close: async () => {
      if (closed) return
      await ready
      await send({ protocol: MESSAGE_PORT_PROTOCOL_VERSION, channel, type: 'close' })
      closed = true
      await unsubscribe?.()
      await Promise.all([...active].map(([id, request]) => cancel(id, request)))
    },
  })
}

/** Creates a server adapter over a MessagePort or custom ordered IPC endpoint. */
export function messagePortAdapter(
  port: MessagePortLike | MessageEndpoint,
  options: MessagePortAdapterOptions = {}
): MessagePortAdapter {
  const endpoint = resolveMessageEndpoint(port)
  const channel = channelName(options)
  return createServerAdapter('message-port', {
    mount: <const ContractType extends Contract, const Context extends object>(
      implementation: ServerExecutableFor<ContractType, Context, 'message-port', MessagePortAdapterContext>,
      mountOptions: MessagePortMountOptions = {}
    ) => createMessagePortServer(port, endpoint, channel, implementation, mountOptions),
  }) as unknown as MessagePortAdapter
}
