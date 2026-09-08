import { decodeDesktopMessage, encodeDesktopMessage } from './desktop-wire'
import type { MessageEndpoint, MessageEndpointSubscription } from './endpoint'
import { DEFAULT_MESSAGE_PORT_CHANNEL, MESSAGE_PORT_PROTOCOL_VERSION } from './protocol'
export { decodeDesktopMessage, encodeDesktopMessage } from './desktop-wire'

/** Host relays carry opaque strings without interpreting or reserializing their contents. */
export type DesktopBridge = {
  readonly send: (message: string) => void | PromiseLike<void>
  readonly subscribe: (
    receive: (message: string) => void
  ) => MessageEndpointSubscription | PromiseLike<MessageEndpointSubscription>
}
export type DesktopEndpointOptions = {
  /** Abort on window destruction, native channel closure, or host shutdown. */
  readonly signal: AbortSignal
  /** Must match the transport/adapter channel when overriding its default. */
  readonly channel?: string
}

/** JSON-safe bridge with ordered sends, async listener readiness, and explicit host lifetime. */
export function desktopEndpoint(bridge: DesktopBridge, options: DesktopEndpointOptions): MessageEndpoint {
  let tail = Promise.resolve()
  let subscribed = false
  let closed = false
  return {
    send: (message) => {
      const task = tail.then(async () => {
        if (closed || options.signal.aborted) throw new Error('Desktop IPC endpoint closed')
        await bridge.send(await encodeDesktopMessage(message))
      })
      tail = task.catch(() => {})
      return task
    },
    subscribe: async (listener) => {
      if (subscribed) throw new Error('Desktop IPC endpoint supports one active session')
      subscribed = true
      let active = true
      let unsubscribe: MessageEndpointSubscription | undefined
      const cleanup = async () => {
        active = false
        closed = true
        options.signal.removeEventListener('abort', abort)
        const release = unsubscribe
        unsubscribe = undefined
        await release?.()
      }
      const abort = () => {
        if (!active) return
        listener({
          protocol: MESSAGE_PORT_PROTOCOL_VERSION,
          channel: options.channel ?? DEFAULT_MESSAGE_PORT_CHANNEL,
          type: 'close',
          id: 'desktop-close',
        })
        void cleanup().catch(() => {})
      }
      options.signal.addEventListener('abort', abort, { once: true })
      try {
        if (options.signal.aborted) {
          abort()
          return cleanup
        }
        unsubscribe = await bridge.subscribe((message) => {
          if (!active) return
          try {
            listener(decodeDesktopMessage(message))
          } catch {
            abort()
          }
        })
        if (!active) await cleanup()
        return cleanup
      } catch (error) {
        await cleanup()
        throw error
      }
    },
  }
}
