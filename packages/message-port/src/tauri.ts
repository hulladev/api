import { desktopEndpoint, type DesktopEndpointOptions } from './desktop'
import type { MessageEndpoint } from './endpoint'

export type TauriMessageChannel = { onmessage: (message: string) => void }
export type TauriBridgeOptions = DesktopEndpointOptions & {
  /** Dedicated Channel<string> supplied by @tauri-apps/api/core. */
  readonly messages: TauriMessageChannel
  /** Register the channel with the native relay; resolve only when routing is ready. */
  readonly connect: () => PromiseLike<unknown>
  /** Invoke an application command that forwards one opaque string to the peer. */
  readonly send: (message: string) => PromiseLike<unknown>
  /** Unregister native routing for this session. Must also handle a failed connect. */
  readonly disconnect: () => void | PromiseLike<void>
}

export function tauriEndpoint(options: TauriBridgeOptions): MessageEndpoint {
  return desktopEndpoint(
    {
      send: async (message) => {
        await options.send(message)
      },
      subscribe: async (receive) => {
        const previous = options.messages.onmessage
        options.messages.onmessage = receive
        try {
          await options.connect()
        } catch (error) {
          options.messages.onmessage = previous
          await options.disconnect()
          throw error
        }
        return async () => {
          if (options.messages.onmessage === receive) options.messages.onmessage = previous
          await options.disconnect()
        }
      },
    },
    options
  )
}
