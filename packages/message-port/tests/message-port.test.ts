import { MessageChannel } from 'node:worker_threads'
import { defineContract } from '@hulla/api'
import { request } from '@hulla/api'
import { response } from '@hulla/api'
import { route } from '@hulla/api'
import { createClient } from '@hulla/api/client'
import { fetchAdapter } from '@hulla/api/fetch'
import { defineServer } from '@hulla/api/server'
import { describe, expect, expectTypeOf, test, vi } from 'vitest'
import { z } from 'zod'
import { messagePortAdapter, messagePortTransport, type MessageEndpoint, type MessagePortLike } from '../src'

function closePorts(channel: MessageChannel): void {
  channel.port1.close()
  channel.port2.close()
}

describe('messagePortTransport', () => {
  test('accepts the DOM MessagePort surface', () => {
    expectTypeOf<MessagePort>().toMatchTypeOf<MessagePortLike>()
  })

  test('multiplexes contract calls and preserves encoded request metadata', async () => {
    const contract = defineContract({
      routes: {
        greeting: route.post('/users/:id', {
          params: z.object({ id: z.string() }),
          query: z.object({ delay: z.string() }),
          headers: z.object({ 'x-request-id': z.string() }),
          body: z.object({ name: z.string() }),
          responses: {
            200: response.json(z.object({ greeting: z.string(), path: z.string() })),
          },
        }),
      },
    })
    const channel = new MessageChannel()
    const adapter = messagePortAdapter(channel.port1)
    const implementation = defineServer(contract, {
      context: adapter.context(({ request }) => ({ requestPath: request.path })),
    }).implement({
      greeting: async ({ body, context, headers, params, query }) => {
        await new Promise((resolve) => setTimeout(resolve, Number(query.delay)))
        return {
          status: 200,
          body: {
            greeting: `${headers['x-request-id']}:${params.id}:${body.name}`,
            path: context.requestPath,
          },
        }
      },
    })
    const server = adapter.mount(implementation)
    const transport = messagePortTransport(channel.port2)
    const client = createClient(contract, { transport })

    try {
      await Promise.all([server.ready, transport.ready])
      const [slow, fast] = await Promise.all([
        client.greeting({
          params: { id: 'one' },
          query: { delay: '20' },
          headers: { 'x-request-id': 'slow' },
          body: { name: 'Ada' },
        }),
        client.greeting({
          params: { id: 'two' },
          query: { delay: '0' },
          headers: { 'x-request-id': 'fast' },
          body: { name: 'Grace' },
        }),
      ])

      expect(slow.body).toEqual({ greeting: 'slow:one:Ada', path: '/users/one' })
      expect(fast.body).toEqual({ greeting: 'fast:two:Grace', path: '/users/two' })
    } finally {
      await transport.close()
      await server.close()
      closePorts(channel)
    }
  })

  test('transports byte and form-data representations without relying on native FormData cloning', async () => {
    const contract = defineContract({
      routes: {
        bytes: route.post('/bytes', {
          body: request.bytes(),
          responses: { 200: response.bytes() },
        }),
        form: route.post('/form', {
          body: request.formData(),
          responses: { 200: response.formData() },
        }),
      },
    })
    const implementation = defineServer(contract).implement({
      bytes: ({ body }) => ({ status: 200, body: body.slice().reverse() }),
      form: ({ body }) => {
        const result = new FormData()
        result.set('received', String(body.get('name')))
        return { status: 200, body: result }
      },
    })
    const channel = new MessageChannel()
    const server = messagePortAdapter(channel.port1).mount(implementation)
    const transport = messagePortTransport(channel.port2)
    const client = createClient(contract, { transport })

    try {
      const data = new FormData()
      data.set('name', 'Ada')
      await expect(client.bytes({ body: new Uint8Array([1, 2, 3]) })).resolves.toMatchObject({
        status: 200,
        body: new Uint8Array([3, 2, 1]),
      })
      const result = await client.form({ body: data })
      expect(result.body.get('received')).toBe('Ada')
    } finally {
      await transport.close()
      await server.close()
      closePorts(channel)
    }
  })

  test('pulls stream chunks on demand and cancels the producer on early return', async () => {
    const contract = defineContract({
      routes: {
        download: route.get('/download', { responses: { 200: response.stream() } }),
      },
    })
    let produced = 0
    let finalized = false
    const implementation = defineServer(contract).implement({
      download: () => ({
        status: 200,
        body: (async function* () {
          try {
            while (true) {
              produced++
              yield new Uint8Array([produced])
            }
          } finally {
            finalized = true
          }
        })(),
      }),
    })
    const channel = new MessageChannel()
    const server = messagePortAdapter(channel.port1).mount(implementation)
    const transport = messagePortTransport(channel.port2)
    const client = createClient(contract, { transport })

    try {
      const result = await client.download()
      const chunks: number[] = []
      for await (const chunk of result.body) {
        chunks.push(chunk[0]!)
        if (chunks.length === 2) break
      }
      expect(chunks).toEqual([1, 2])
      expect(produced).toBe(2)
      await vi.waitFor(() => expect(finalized).toBe(true))
    } finally {
      await transport.close()
      await server.close()
      closePorts(channel)
    }
  })

  test('propagates AbortSignal cancellation to adapter-native server context', async () => {
    const contract = defineContract({
      routes: {
        wait: route.get('/wait', { responses: { 200: response.empty() } }),
      },
    })
    const channel = new MessageChannel()
    const adapter = messagePortAdapter(channel.port1)
    let serverAborted = false
    let markStarted!: () => void
    const started = new Promise<void>((resolve) => {
      markStarted = resolve
    })
    const implementation = defineServer(contract, {
      context: adapter.context(({ request }) => ({ signal: request.signal })),
    }).implement({
      wait: async ({ context }) => {
        markStarted()
        await new Promise<void>((resolve) => {
          context.signal.addEventListener(
            'abort',
            () => {
              serverAborted = true
              resolve()
            },
            { once: true }
          )
        })
        return { status: 200 }
      },
    })
    const server = adapter.mount(implementation)
    const transport = messagePortTransport(channel.port2)
    const client = createClient(contract, { transport })
    const controller = new AbortController()

    try {
      const pending = client.wait({ signal: controller.signal })
      await started
      controller.abort(new Error('stop'))
      await expect(pending).rejects.toThrow('stop')
      await vi.waitFor(() => expect(serverAborted).toBe(true))
    } finally {
      await transport.close()
      await server.close()
      closePorts(channel)
    }
  })

  test('supports Electron MessagePortMain-style EventEmitter listeners', async () => {
    const contract = defineContract({
      routes: { health: route.get('/health', { responses: { 200: response.text() } }) },
    })
    const implementation = defineServer(contract).implement({
      health: () => ({ status: 200, body: 'ok' }),
    })
    const channel = new MessageChannel()
    const electronPort = (port: typeof channel.port1): MessagePortLike => ({
      postMessage: (message) => port.postMessage(message),
      on: (_type, listener) => port.on('message', listener as never),
      off: (_type, listener) => port.off('message', listener as never),
      start: () => port.start(),
    })
    const server = messagePortAdapter(electronPort(channel.port1)).mount(implementation)
    const transport = messagePortTransport(electronPort(channel.port2))
    const client = createClient(contract, { transport })

    try {
      await expect(client.health()).resolves.toMatchObject({ status: 200, body: 'ok' })
    } finally {
      await transport.close()
      await server.close()
      closePorts(channel)
    }
  })

  test('accepts async custom endpoints for host IPC bridges', async () => {
    const listeners: readonly [Set<(message: unknown) => void>, Set<(message: unknown) => void>] = [
      new Set(),
      new Set(),
    ]
    const endpoint = (side: 0 | 1): MessageEndpoint => ({
      send: async (message) => {
        await Promise.resolve()
        for (const listener of listeners[side === 0 ? 1 : 0]) listener(message)
      },
      subscribe: async (listener) => {
        await Promise.resolve()
        listeners[side].add(listener)
        return () => {
          listeners[side].delete(listener)
        }
      },
    })
    const contract = defineContract({
      routes: { health: route.get('/health', { responses: { 204: response.empty() } }) },
    })
    const implementation = defineServer(contract).implement({ health: () => ({ status: 204 }) })
    const server = messagePortAdapter(endpoint(0), { channel: 'desktop-ipc' }).mount(implementation)
    const transport = messagePortTransport(endpoint(1), { channel: 'desktop-ipc' })
    const client = createClient(contract, { transport })

    try {
      await expect(client.health()).resolves.toEqual({ status: 204, headers: {} })
    } finally {
      await transport.close()
      await server.close()
    }
  })

  test('rejects context factories bound to another adapter', () => {
    const contract = defineContract({
      routes: { health: route.get('/health', { responses: { 200: response.text() } }) },
    })
    const fetch = fetchAdapter()
    const implementation = defineServer(contract, {
      context: fetch.context(({ request }) => ({ method: request.method })),
    }).implement({
      health: ({ context }) => ({ status: 200, body: context.method }),
    })
    const channel = new MessageChannel()
    const invalidMount = () => {
      // @ts-expect-error A Fetch-bound implementation cannot be mounted on a message port.
      messagePortAdapter(channel.port1).mount(implementation)
    }
    expectTypeOf(invalidMount).toBeFunction()
    expect(() => messagePortAdapter(channel.port1).mount(implementation as never)).toThrow(
      'Server requires the fetch adapter, but was mounted with message-port'
    )
    closePorts(channel)
  })
})

test.each(['abort', 'remote-close'] as const)(
  'retains MessagePort %s failures between stream pulls',
  async (failure) => {
    const channel = new MessageChannel()
    const contract = defineContract({ routes: { download: route.get('/', { responses: { 200: response.stream() } }) } })
    const implementation = defineServer(contract).implement({
      download: () => ({
        status: 200,
        body: (async function* () {
          yield new Uint8Array([1])
          yield new Uint8Array([2])
        })(),
      }),
    })
    const server = messagePortAdapter(channel.port1).mount(implementation)
    const transport = messagePortTransport(channel.port2)
    const controller = new AbortController()
    try {
      const client = createClient(contract, { transport })
      const result = await client.download({ signal: controller.signal })
      const iterator = result.body[Symbol.asyncIterator]()
      expect(await iterator.next()).toEqual({ done: false, value: new Uint8Array([1]) })
      const reason = new Error('stop between pulls')
      if (failure === 'abort') controller.abort(reason)
      else {
        const closed = new Promise<void>((resolve) => {
          const listener = (message: { readonly type?: string }) => {
            if (message.type !== 'close') return
            channel.port2.off('message', listener)
            resolve()
          }
          channel.port2.on('message', listener)
        })
        await server.close()
        await closed
      }
      for (let read = 0; read < 2; read++) {
        await expect(iterator.next()).rejects.toMatchObject(failure === 'abort' ? reason : { code: 'closed' })
      }
    } finally {
      await transport.close()
      await server.close()
      closePorts(channel)
    }
  }
)

test('aborts during endpoint setup without cancelling other calls or sending the aborted request', async () => {
  let finishSetup!: (cleanup: () => void) => void
  let receive!: (message: unknown) => void
  const sent: string[] = []
  const endpoint: MessageEndpoint = {
    subscribe(listener) {
      receive = listener
      return new Promise((resolve) => {
        finishSetup = resolve
      })
    },
    send(message) {
      if (message.type !== 'request') return
      sent.push(message.request.path)
      receive({
        ...message,
        type: 'response',
        response: { status: 200, headers: {}, body: { kind: 'text', value: 'ok' } },
      })
    },
  }
  const transport = messagePortTransport(endpoint)
  const controller = new AbortController()
  const call = transport({ key: [], method: 'GET', path: '/cancelled', headers: {}, signal: controller.signal })
  const other = transport({ key: [], method: 'GET', path: '/other', headers: {} })
  const reason = new Error('abort while connecting')
  controller.abort(reason)
  await expect(call).rejects.toBe(reason)
  expect(sent).toEqual([])
  finishSetup(() => {})
  await expect(other).resolves.toMatchObject({ status: 200 })
  expect(sent).toEqual(['/other'])
  await transport.close()
})
