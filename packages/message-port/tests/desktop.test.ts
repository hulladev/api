import { describe, expect, it } from 'vitest'
import { adapterConformance } from '../../../scripts/adapter-conformance'
import { messagePortAdapter, messagePortTransport } from '../src'
import { desktopEndpoint, encodeDesktopMessage, decodeDesktopMessage, type DesktopBridge } from '../src/desktop'
import { dioxusEndpoint } from '../src/dioxus'
import { tauriEndpoint } from '../src/tauri'

function pair() {
  const listeners = [new Set<(message: string) => void>(), new Set<(message: string) => void>()]
  const endpoint = (index: number): DesktopBridge => ({
    send: (message) => {
      for (const receive of listeners[1 - index]!) receive(message)
    },
    subscribe: async (receive) => {
      await Promise.resolve()
      listeners[index]!.add(receive)
      return () => {
        listeners[index]!.delete(receive)
      }
    },
  })
  return { ends: [endpoint(0), endpoint(1)] as const, listeners }
}

adapterConformance({
  name: 'Desktop JSON bridge',
  formData: true,
  cancellation: true,
  malformedJson: 'IPC uses an encoded message protocol, not HTTP request JSON',
  async open(implementation) {
    const { ends } = pair()
    const lifetime = new AbortController()
    const server = messagePortAdapter(desktopEndpoint(ends[0], { signal: lifetime.signal })).mount(implementation)
    const transport = messagePortTransport(desktopEndpoint(ends[1], { signal: lifetime.signal }))
    await Promise.all([server.ready, transport.ready])
    return {
      transport,
      async close() {
        await transport.close()
        await server.close()
        lifetime.abort()
      },
    }
  },
})

describe('desktop hosts', () => {
  it('preserves binary, undefined and user records without tag collisions', async () => {
    const value = {
      bytes: new Uint8Array([0, 255]),
      tag: ['bytes', 'user data'],
      absent: undefined,
      record: JSON.parse('{"__proto__":{"safe":true}}') as unknown,
    }
    expect(decodeDesktopMessage(await encodeDesktopMessage(value))).toEqual(value)
    expect(Object.prototype).not.toHaveProperty('safe')
    await expect(encodeDesktopMessage(new Date())).rejects.toThrow('plain records')
    expect(() => decodeDesktopMessage('["bytes",42]')).toThrow('Invalid Desktop IPC binary value')
  })

  it('waits for Tauri channel registration and restores its listener on close', async () => {
    const previous = () => {}
    const messages = { onmessage: previous }
    let complete!: () => void
    let disconnected = 0
    const sent: string[] = []
    const endpoint = tauriEndpoint({
      messages,
      signal: new AbortController().signal,
      connect: () =>
        new Promise<void>((resolve) => {
          complete = resolve
        }),
      send: async (message) => {
        sent.push(message)
      },
      disconnect: () => {
        disconnected++
      },
    })
    const transport = messagePortTransport(endpoint)
    let ready = false
    void transport.ready.then(() => {
      ready = true
    })
    await Promise.resolve()
    expect(ready).toBe(false)
    complete()
    await transport.ready
    expect(messages.onmessage).not.toBe(previous)
    await transport.close()
    expect(messages.onmessage).toBe(previous)
    expect(disconnected).toBe(1)
    expect(sent).toEqual([])
  })

  it('cleans up registration that finishes after host shutdown', async () => {
    const lifetime = new AbortController()
    const messages = { onmessage: (_message: string) => {} }
    let complete!: () => void
    let released = 0
    const transport = messagePortTransport(
      tauriEndpoint({
        messages,
        signal: lifetime.signal,
        connect: () =>
          new Promise<void>((resolve) => {
            complete = resolve
          }),
        send: async () => {},
        disconnect: () => {
          released++
        },
      })
    )
    lifetime.abort()
    complete()
    await transport.ready
    expect(released).toBe(1)
    await transport.close()
  })

  it('Dioxus receives opaque JSON strings and terminates on eval failure', async () => {
    const values: unknown[] = []
    let reject!: (reason: Error) => void
    const signal = new AbortController().signal
    let reads = 0
    const endpoint = dioxusEndpoint(
      {
        send: () => {},
        recv: () => {
          reads++
          return reads === 1
            ? Promise.resolve('"hello"')
            : new Promise((_, fail) => {
                reject = fail
              })
        },
      },
      { signal }
    )
    const cleanup = await endpoint.subscribe((value) => values.push(value))
    await Promise.resolve()
    expect(values).toEqual(['hello'])
    reject(new Error('eval dropped'))
    await Promise.resolve()
    expect(values[1]).toMatchObject({ type: 'close' })
    await cleanup()
  })

  it('malformed messages close the session and remove its listener', async () => {
    const { ends, listeners } = pair()
    const endpoint = desktopEndpoint(ends[0], { signal: new AbortController().signal })
    const received: unknown[] = []
    await endpoint.subscribe((message) => received.push(message))
    await ends[1].send('broken JSON')
    expect(received).toEqual([expect.objectContaining({ type: 'close' })])
    expect(listeners[0]!.size).toBe(0)
  })
})

for (const host of ['Tauri', 'Dioxus'] as const) {
  adapterConformance({
    name: `${host} simulated native relay`,
    formData: true,
    cancellation: true,
    malformedJson: 'Native relay carries the desktop protocol, not HTTP request JSON',
    async open(implementation) {
      const lifetime = new AbortController()
      const { ends } = pair()
      const wrap = (bridge: DesktopBridge) => {
        if (host === 'Tauri') {
          const messages = { onmessage: (_message: string) => {} }
          let release: (() => void | PromiseLike<void>) | undefined
          return tauriEndpoint({
            messages,
            signal: lifetime.signal,
            connect: async () => {
              release = await bridge.subscribe((message) => messages.onmessage(message))
            },
            send: async (message) => {
              await bridge.send(message)
            },
            disconnect: async () => {
              await release?.()
            },
          })
        }
        const queue: string[] = []
        let pending: ((message: string) => void) | undefined
        let fail: ((error: Error) => void) | undefined
        void bridge.subscribe((message) => {
          if (pending) {
            const resolve = pending
            pending = undefined
            resolve(message)
          } else queue.push(message)
        })
        lifetime.signal.addEventListener('abort', () => fail?.(new Error('native eval dropped')), { once: true })
        return dioxusEndpoint(
          {
            send: bridge.send,
            recv: () => {
              const message = queue.shift()
              if (message !== undefined) return Promise.resolve(message)
              return new Promise<string>((resolve, reject) => {
                pending = resolve
                fail = reject
              })
            },
          },
          { signal: lifetime.signal }
        )
      }
      const server = messagePortAdapter(wrap(ends[0])).mount(implementation)
      const transport = messagePortTransport(wrap(ends[1]))
      await Promise.all([server.ready, transport.ready])
      return {
        transport,
        async close() {
          await transport.close()
          await server.close()
          lifetime.abort()
        },
      }
    },
  })
}
