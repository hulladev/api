import { once } from 'node:events'
import { defineContract, request, response, route } from '@hulla/api'
import { defineClient } from '@hulla/api/client'
import { inProcessTransport } from '@hulla/api/in-process'
import { defineServer } from '@hulla/api/server'
import { expect, expectTypeOf, test } from 'vitest'
import { WebSocket, WebSocketServer } from 'ws'
import { z } from 'zod'
import {
  webSocketAdapter,
  webSocketTransport,
  type WebSocketContextInput,
  type WebSocketServer as MountedWebSocketServer,
  type WebSocketTransport,
} from '../src'
import { decodeWire, encodeWire } from '../src/wire'

async function pair(nativeClient = false) {
  const server = new WebSocketServer({ port: 0, host: '127.0.0.1' })
  await once(server, 'listening')
  const address = server.address()
  if (address === null || typeof address === 'string') throw new Error('Expected a TCP address')
  const accepted = once(server, 'connection')
  const client = nativeClient
    ? new globalThis.WebSocket(`ws://127.0.0.1:${address.port}`)
    : new WebSocket(`ws://127.0.0.1:${address.port}`)
  const [socket] = (await accepted) as [WebSocket]
  const transport = webSocketTransport(client)
  let mounted: MountedWebSocketServer | undefined
  return {
    socket,
    client,
    transport,
    mount(value: MountedWebSocketServer) {
      mounted = value
    },
    async close() {
      await transport.close()
      await mounted?.close()
      client.close()
      socket.terminate()
      await new Promise<void>((resolve, reject) => server.close((error) => (error ? reject(error) : resolve())))
    },
  }
}

const contract = defineContract({
  routes: {
    echo: route.post('/echo', { body: request.json(z.json()), responses: { 200: response.json(z.json()) } }),
    wait: route.get('/wait', { responses: { 200: response.text() } }),
    stream: route.get('/stream', { responses: { 200: response.stream() } }),
  },
})

test('uses the native WebSocket client and preserves native context, fragments and concurrent correlation', async () => {
  const peers = await pair(true)
  try {
    const adapter = webSocketAdapter(peers.socket)
    const server = defineServer(contract, {
      context: adapter.context((input) => {
        expectTypeOf(input).toMatchTypeOf<WebSocketContextInput>()
        expect(input.socket).toBe(peers.socket)
        expect(input.request.signal).toBe(input.signal)
        return { method: input.request.method }
      }),
    })
    const fragment = server.implement(contract.routes.echo, async ({ body, context }) => {
      await new Promise((resolve) => setTimeout(resolve, body === 'first' ? 20 : 0))
      return { status: 200, body: { body, method: context.method } }
    })
    expect(() => inProcessTransport(fragment as never)).toThrow('Server requires the websocket adapter')
    peers.mount(adapter.mount(fragment))
    const client = defineClient(contract, { transport: peers.transport })
    const result = await Promise.all([client.echo({ body: 'first' }), client.echo({ body: 'second' })])
    expect(result.map((value) => value.body)).toEqual([
      { body: 'first', method: 'POST' },
      { body: 'second', method: 'POST' },
    ])
  } finally {
    await peers.close()
  }
})

test('fails pending calls on disconnect, aborts server work and never replays requests', async () => {
  const peers = await pair()
  let signal: AbortSignal | undefined
  let calls = 0
  try {
    const fragment = defineServer(contract).implement(contract.routes.wait, async (input) => {
      signal = input.signal
      calls++
      await new Promise<void>((resolve) => input.signal.addEventListener('abort', () => resolve(), { once: true }))
      return { status: 200, body: 'cancelled' }
    })
    peers.mount(webSocketAdapter(peers.socket).mount(fragment))
    const client = defineClient(contract, { transport: peers.transport })
    const pending = client.wait().catch((error: unknown) => error)
    await expect.poll(() => signal).toBeDefined()
    peers.socket.terminate()
    expect(await pending).toMatchObject({ code: 'closed' })
    await expect.poll(() => signal?.aborted).toBe(true)
    await expect(client.wait()).rejects.toMatchObject({ code: 'closed' })
    expect(calls).toBe(1)
  } finally {
    await peers.close()
  }
})

test('propagates a socket disconnect into an active response stream and finalizes the producer', async () => {
  const peers = await pair()
  let finalized = false
  try {
    const fragment = defineServer(contract).implement(contract.routes.stream, () => ({
      status: 200,
      body: (async function* () {
        try {
          yield new Uint8Array([1])
          yield new Uint8Array([2])
        } finally {
          finalized = true
        }
      })(),
    }))
    peers.mount(webSocketAdapter(peers.socket).mount(fragment))
    const result = await defineClient(contract, { transport: peers.transport }).stream()
    const iterator = result.body[Symbol.asyncIterator]()
    expect((await iterator.next()).value).toEqual(new Uint8Array([1]))
    peers.socket.terminate()
    await peers.transport.closed
    await expect(iterator.next()).rejects.toMatchObject({ code: 'closed' })
    await expect.poll(() => finalized).toBe(true)
  } finally {
    await peers.close()
  }
})

test('pulls exactly one producer chunk per consumer next and releases listeners without closing the socket', async () => {
  const peers = await pair()
  let produced = 0
  let finalized = false
  try {
    const fragment = defineServer(contract).implement(contract.routes.stream, () => ({
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
    }))
    const mounted = webSocketAdapter(peers.socket).mount(fragment)
    peers.mount(mounted)
    const result = await defineClient(contract, { transport: peers.transport }).stream()
    expect(produced).toBe(0)
    const iterator = result.body[Symbol.asyncIterator]()
    await iterator.next()
    expect(produced).toBe(1)
    await iterator.return?.()
    await expect.poll(() => finalized).toBe(true)
    await peers.transport.close()
    await mounted.close()
    expect(peers.client.readyState).toBe(1)
    expect(peers.socket.readyState).toBe(1)
    expect(peers.socket.listenerCount('message')).toBe(0)
  } finally {
    await peers.close()
  }
})

test('rejects malformed protocol frames and exposes the terminal error', async () => {
  const peers = await pair()
  try {
    await peers.transport.ready
    peers.socket.send('{not-json')
    expect(await peers.transport.closed).toMatchObject({ code: 'invalid-message' })
    await expect(
      defineClient(contract, { transport: peers.transport }).echo({ body: 'ignored' })
    ).rejects.toMatchObject({ code: 'invalid-message' })
  } finally {
    await peers.close()
  }
})

class ConnectingSocket extends EventTarget {
  readyState = 0
  readonly sent: string[] = []
  send(value: string) {
    this.sent.push(value)
  }
  open() {
    this.readyState = 1
    this.dispatchEvent(new Event('open'))
  }
}

test('cancels while connecting and does not send the call when the socket eventually opens', async () => {
  const socket = new ConnectingSocket()
  const transport: WebSocketTransport = webSocketTransport(socket)
  const abort = new AbortController()
  const pending = defineClient(contract, { transport }).echo({ body: 'never' }, { signal: abort.signal })
  abort.abort(new Error('cancel before open'))
  await expect(pending).rejects.toThrow('cancel before open')
  socket.open()
  await transport.ready
  expect(socket.sent).toEqual([])
  await transport.close()
})

test('closing before open rejects readiness and outstanding calls without owning socket closure', async () => {
  const socket = new ConnectingSocket()
  const transport = webSocketTransport(socket)
  const pending = defineClient(contract, { transport })
    .echo({ body: 'never' })
    .catch((error: unknown) => error)
  await transport.close()
  await expect(transport.ready).rejects.toMatchObject({ code: 'closed' })
  expect(await pending).toMatchObject({ code: 'closed' })
  expect(socket.readyState).toBe(0)
})

test('preserves user containers and prototype-like keys without wire-tag collisions', async () => {
  const input = JSON.parse(
    '{"__proto__":{"safe":true},"constructor":"value","array":["bytes","not-base64"],"tag":{"$hulla:bytes":0}}'
  )
  const decoded = decodeWire(await encodeWire(input))
  expect(decoded).toEqual(input)
  expect(Object.getPrototypeOf(decoded)).toBe(Object.prototype)
  expect(Object.hasOwn(decoded as object, '__proto__')).toBe(true)
  expect(decodeWire(await encodeWire(new Uint8Array([0, 128, 255])))).toEqual(new Uint8Array([0, 128, 255]))
})

test('rejects unsupported native and cyclic values without silently altering their data', async () => {
  const cyclic: Record<string, unknown> = {}
  cyclic['self'] = cyclic
  await expect(encodeWire(cyclic)).rejects.toThrow('must not contain cycles')
  await expect(encodeWire(new Response('raw'))).rejects.toThrow('must be plain records')
  await expect(encodeWire(Number.POSITIVE_INFINITY)).rejects.toThrow('must be JSON-compatible')
  expect(() => decodeWire('["bytes",{}]')).toThrow('Invalid WebSocket binary value')
  expect(() => decodeWire('["object",[["key",1],["key",2]]]')).toThrow('Duplicate WebSocket object key')
})

test('retains a falsy abort reason for subsequent stream reads', async () => {
  const peers = await pair()
  try {
    peers.mount(
      webSocketAdapter(peers.socket).mount(
        defineServer(contract).implement(contract.routes.stream, () => ({
          status: 200,
          body: (async function* () {
            yield new Uint8Array([1])
            yield new Uint8Array([2])
          })(),
        }))
      )
    )
    const abort = new AbortController()
    const result = await defineClient(contract, { transport: peers.transport }).stream({ signal: abort.signal })
    const iterator = result.body[Symbol.asyncIterator]()
    await iterator.next()
    abort.abort(null)
    await expect(iterator.next()).rejects.toBeNull()
    await expect(iterator.next()).rejects.toBeNull()
  } finally {
    await peers.close()
  }
})

test('does not send a request cancelled during asynchronous file encoding', async () => {
  const socket = new ConnectingSocket()
  socket.open()
  const transport = webSocketTransport(socket)
  const abort = new AbortController()
  let finish!: (value: ArrayBuffer) => void
  let started = false
  const file = new File(['payload'], 'payload.txt')
  file.arrayBuffer = () => {
    started = true
    return new Promise((resolve) => {
      finish = resolve
    })
  }
  const form = new FormData()
  form.append('file', file)
  const pending = Promise.resolve(
    transport({
      method: 'POST',
      path: '/upload',
      key: ['upload'],
      headers: {},
      body: { kind: 'form-data', contentType: 'multipart/form-data', value: form },
      signal: abort.signal,
    })
  ).catch((error: unknown) => error)
  await expect.poll(() => started).toBe(true)
  abort.abort(new Error('cancel during encoding'))
  expect(await pending).toMatchObject({ message: 'cancel during encoding' })
  finish(new ArrayBuffer(0))
  await transport.close()
  expect(socket.sent.map((value) => (decodeWire(value) as { type: string }).type)).not.toContain('request')
})
