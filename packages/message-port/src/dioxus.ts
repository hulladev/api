import { desktopEndpoint, type DesktopEndpointOptions } from './desktop'
import type { MessageEndpoint } from './endpoint'

/** The dioxus object injected into a document.eval script. One eval per API session. */
export type DioxusEval = {
  readonly send: (message: string) => void | PromiseLike<void>
  readonly recv: () => PromiseLike<unknown>
}
export function dioxusEndpoint(evalChannel: DioxusEval, options: DesktopEndpointOptions): MessageEndpoint {
  const lifetime = new AbortController()
  const abort = () => lifetime.abort(options.signal.reason)
  return desktopEndpoint(
    {
      send: (message) => evalChannel.send(message),
      subscribe: (receive) => {
        let active = true
        options.signal.addEventListener('abort', abort, { once: true })
        if (options.signal.aborted) abort()
        void (async () => {
          try {
            while (active && !lifetime.signal.aborted) {
              const message = await evalChannel.recv()
              if (!active || lifetime.signal.aborted) break
              if (typeof message !== 'string') throw new TypeError('Dioxus relay must send strings')
              receive(message)
            }
          } catch {
            lifetime.abort(new Error('Dioxus eval channel closed'))
          }
        })()
        return () => {
          active = false
          options.signal.removeEventListener('abort', abort)
          // The native owner must drop the eval to release an outstanding recv().
        }
      },
    },
    { ...options, signal: lifetime.signal }
  )
}
