import type { MessagePortMessage } from './protocol'

export type MessageEndpointSubscription = () => void | PromiseLike<void>
export type MessageEndpointListener = (message: unknown) => void

/** An ordered, bidirectional message endpoint suitable for custom IPC bridges. */
export type MessageEndpoint = {
  readonly send: (message: MessagePortMessage) => void | PromiseLike<void>
  readonly subscribe: (
    listener: MessageEndpointListener
  ) => MessageEndpointSubscription | PromiseLike<MessageEndpointSubscription>
}

type MessageEventLike = { readonly data: unknown }
type MessagePortListener = (event: MessageEventLike) => void

/** The common surface shared by DOM MessagePort, worker_threads MessagePort, and Electron MessagePortMain. */
export type MessagePortLike = {
  postMessage(message: unknown): void
  start?(): void
  addEventListener?(type: 'message', listener: MessagePortListener): void
  removeEventListener?(type: 'message', listener: MessagePortListener): void
  on?(type: 'message', listener: MessagePortListener): unknown
  off?(type: 'message', listener: MessagePortListener): unknown
  removeListener?(type: 'message', listener: MessagePortListener): unknown
}

function eventData(event: unknown): unknown {
  return typeof event === 'object' && event !== null && 'data' in event ? (event as MessageEventLike).data : event
}

/** Normalizes browser, worker, Node, and Electron message ports to the async endpoint API. */
export function messagePortEndpoint(port: MessagePortLike): MessageEndpoint {
  if (typeof port.postMessage !== 'function') throw new TypeError('Message port must provide postMessage()')

  return {
    send: (message) => port.postMessage(message),
    subscribe: (listener) => {
      const receive: MessagePortListener = (event) => listener(eventData(event))

      if (typeof port.addEventListener === 'function' && typeof port.removeEventListener === 'function') {
        port.addEventListener('message', receive)
        port.start?.()
        return () => port.removeEventListener?.('message', receive)
      }

      if (
        typeof port.on === 'function' &&
        (typeof port.off === 'function' || typeof port.removeListener === 'function')
      ) {
        port.on('message', receive)
        port.start?.()
        return () => {
          if (typeof port.off === 'function') port.off('message', receive)
          else port.removeListener?.('message', receive)
        }
      }

      throw new TypeError('Message port must provide EventTarget or EventEmitter message listeners')
    },
  }
}

export function resolveMessageEndpoint(endpoint: MessageEndpoint | MessagePortLike): MessageEndpoint {
  return 'send' in endpoint && 'subscribe' in endpoint ? endpoint : messagePortEndpoint(endpoint)
}
