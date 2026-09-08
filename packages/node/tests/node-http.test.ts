import { createServer, type Server } from 'node:http'
import { defineContract, request, response, route } from '@hulla/api'
import { inProcessTransport } from '@hulla/api/in-process'
import { defineServer } from '@hulla/api/server'
import { describe, expect, expectTypeOf, test, vi } from 'vitest'
import { z } from 'zod'
import {
  nodeHttpAdapter,
  type NodeHttpContextInput,
  type NodeHttpHandler,
  type NodeHttpRequest,
  type NodeHttpResponse,
  type NodeHttpServerErrorInput,
} from '../src/http'

type TestServer = {
  readonly origin: string
  readonly server: Server
}

async function listen(handler: NodeHttpHandler): Promise<TestServer> {
  const server = createServer(handler)
  await new Promise<void>((resolve, reject) => {
    server.once('listening', resolve)
    server.once('error', reject)
    server.listen(0, '127.0.0.1')
  })
  const address = server.address()
  if (address === null || typeof address === 'string') throw new Error('Expected a TCP server address')
  return { origin: `http://127.0.0.1:${address.port}`, server }
}

async function close(server: Server): Promise<void> {
  if (!server.listening) return
  await new Promise<void>((resolve, reject) => {
    server.close((error) => (error === undefined ? resolve() : reject(error)))
  })
}

const contract = defineContract({
  basePath: '/api',
  routes: {
    create: route.post('/items/:id', {
      params: z.object({ id: z.string() }),
      query: z.object({ tag: z.union([z.string(), z.array(z.string())]) }),
      headers: z.object({ 'x-actor': z.string() }),
      body: request.json(z.object({ name: z.string() })),
      responses: {
        201: response.json(
          z.object({ actor: z.string(), id: z.string(), name: z.string(), tags: z.array(z.string()) })
        ),
      },
    }),
    bytes: route.post('/bytes', {
      body: request.bytes(),
      responses: { 200: response.bytes() },
    }),
    text: route.post('/text', {
      body: request.text(),
      responses: { 200: response.text() },
    }),
    form: route.post('/form', {
      body: request.formData(),
      responses: { 200: response.text() },
    }),
    stream: route.get('/stream', {
      responses: { 200: response.stream({ contentType: 'application/octet-stream' }) },
    }),
    representations: route.get('/representations/:kind', {
      params: z.object({ kind: z.string() }),
      responses: {
        200: response.raw(),
        201: response.formData(),
      },
    }),
    fail: route.get('/fail', { responses: { 200: response.text() } }),
  },
})

function implementation(
  adapter = nodeHttpAdapter(),
  onContext?: (input: NodeHttpContextInput<typeof contract>) => void
) {
  return defineServer(contract, {
    context: adapter.context((input) => {
      expectTypeOf(input.request).toEqualTypeOf<NodeHttpRequest>()
      expectTypeOf(input.response).toEqualTypeOf<NodeHttpResponse>()
      onContext?.(input as NodeHttpContextInput<typeof contract>)
      return { method: input.request.method }
    }),
  }).implement({
    create: ({ body, context, headers, params, query }) => ({
      status: 201,
      body: {
        actor: headers['x-actor'],
        id: params.id,
        name: `${body.name}:${context.method}`,
        tags: typeof query.tag === 'string' ? [query.tag] : [...query.tag],
      },
    }),
    bytes: ({ body }) => ({ status: 200, body }),
    text: ({ body }) => ({ status: 200, body: body.toUpperCase() }),
    form: ({ body }) => ({ status: 200, body: String(body.get('name')) }),
    stream: () => ({
      status: 200,
      body: (async function* () {
        yield new Uint8Array([1, 2])
        yield new Uint8Array([3, 4])
      })(),
    }),
    representations: ({ params }) => {
      if (params.kind === 'raw') {
        return {
          status: 200,
          body: new Response('raw', { status: 200, headers: { 'x-native': 'yes' } }),
        }
      }
      const body = new FormData()
      body.set('name', 'Hulla')
      return { status: 201, body }
    },
    fail: (): { readonly body: string; readonly status: 200 } => {
      throw new Error('failure')
    },
  })
}

describe('Node HTTP integration', () => {
  test('handles native requests, decoded inputs, and context', async () => {
    let contextInput: NodeHttpContextInput<typeof contract> | undefined
    const adapter = nodeHttpAdapter()
    const serverImplementation = implementation(adapter, (input) => {
      contextInput = input
    })
    const handler = adapter.mount(serverImplementation)
    const testServer = await listen(handler)

    try {
      expectTypeOf(handler).toEqualTypeOf<NodeHttpHandler>()
      const result = await fetch(`${testServer.origin}/api/items/item%201?tag=first&tag=second`, {
        method: 'POST',
        headers: { 'content-type': 'application/json', 'x-actor': 'Ada' },
        body: JSON.stringify({ name: 'Compiler' }),
      })

      expect(result.status).toBe(201)
      await expect(result.json()).resolves.toEqual({
        actor: 'Ada',
        id: 'item 1',
        name: 'Compiler:POST',
        tags: ['first', 'second'],
      })
      expect(contextInput?.request).toBeInstanceOf(Object)
      expect(contextInput?.response).toBeInstanceOf(Object)
      expect(contextInput?.request.readableEnded).toBe(true)
      expect(contextInput?.route).toEqual({ key: ['create'], method: 'POST', path: '/api/items/:id' })
      expect(() => inProcessTransport(serverImplementation as never)).toThrow(
        'Server requires the node-http adapter, but was mounted with in-process'
      )
    } finally {
      await close(testServer.server)
    }
  })

  test('supports text, byte, form-data, stream, and raw representations', async () => {
    const testServer = await listen(nodeHttpAdapter().mount(implementation()))

    try {
      const bytes = await fetch(`${testServer.origin}/api/bytes`, {
        method: 'POST',
        headers: { 'content-type': 'application/octet-stream' },
        body: new Uint8Array([0, 127, 255]),
      })
      expect(bytes.status).toBe(200)
      expect(new Uint8Array(await bytes.arrayBuffer())).toEqual(new Uint8Array([0, 127, 255]))

      const text = await fetch(`${testServer.origin}/api/text`, {
        method: 'POST',
        headers: { 'content-type': 'text/plain' },
        body: 'hello',
      })
      expect(text.status).toBe(200)
      await expect(text.text()).resolves.toBe('HELLO')

      const formBody = new FormData()
      formBody.set('name', 'Ada')
      const form = await fetch(`${testServer.origin}/api/form`, { method: 'POST', body: formBody })
      expect(form.status).toBe(200)
      await expect(form.text()).resolves.toBe('Ada')

      const stream = await fetch(`${testServer.origin}/api/stream`)
      expect(stream.status).toBe(200)
      expect(new Uint8Array(await stream.arrayBuffer())).toEqual(new Uint8Array([1, 2, 3, 4]))

      const raw = await fetch(`${testServer.origin}/api/representations/raw`)
      expect(raw.status).toBe(200)
      expect(raw.headers.get('x-native')).toBe('yes')
      await expect(raw.text()).resolves.toBe('raw')

      const responseForm = await fetch(`${testServer.origin}/api/representations/form`)
      expect(responseForm.status).toBe(201)
      expect((await responseForm.formData()).get('name')).toBe('Hulla')
    } finally {
      await close(testServer.server)
    }
  })

  test('returns protocol-safe routing responses and suppresses HEAD bodies', async () => {
    const headContract = defineContract({
      routes: { value: route.get('/value', { responses: { 200: response.text() } }) },
    })
    const serverImplementation = defineServer(headContract).implement({
      value: () => ({ status: 200, body: 'body' }),
    })
    const testServer = await listen(nodeHttpAdapter().mount(serverImplementation))

    try {
      const missing = await fetch(`${testServer.origin}/missing`)
      expect(missing.status).toBe(404)

      const disallowed = await fetch(`${testServer.origin}/value`, { method: 'POST' })
      expect(disallowed.status).toBe(405)
      expect(disallowed.headers.get('allow')).toBe('GET')

      const head = await fetch(`${testServer.origin}/value`, { method: 'HEAD' })
      expect(head.status).toBe(200)
      await expect(head.text()).resolves.toBe('')
    } finally {
      await close(testServer.server)
    }
  })

  test('forwards native state to shared and per-mount error hooks', async () => {
    const sharedError = vi.fn<(input: NodeHttpServerErrorInput) => void>()
    const mountError = vi.fn<(input: NodeHttpServerErrorInput) => void>()
    const adapter = nodeHttpAdapter({ onError: sharedError })
    const handler = adapter.mount(implementation(adapter), {
      onError(input) {
        expectTypeOf(input).toEqualTypeOf<NodeHttpServerErrorInput>()
        mountError(input)
        return {
          status: 503,
          headers: { 'content-type': 'text/plain', 'x-error-phase': input.phase },
          body: { kind: 'text', value: 'replaced' },
        }
      },
    })
    const testServer = await listen(handler)

    try {
      const result = await fetch(`${testServer.origin}/api/fail`)
      expect(result.status).toBe(503)
      expect(result.headers.get('x-error-phase')).toBe('handler')
      await expect(result.text()).resolves.toBe('replaced')
      expect(sharedError).not.toHaveBeenCalled()
      expect(mountError).toHaveBeenCalledWith(
        expect.objectContaining({
          phase: 'handler',
          route: { key: ['fail'], method: 'GET', path: '/api/fail' },
          request: expect.any(Object),
          response: expect.any(Object),
        })
      )
    } finally {
      await close(testServer.server)
    }
  })

  test('mounts implementation fragments through the catch-all handler', async () => {
    const fragmentContract = defineContract({
      routes: {
        first: route.get('/first', { responses: { 200: response.text() } }),
        second: route.get('/second', { responses: { 200: response.text() } }),
      },
    })
    const server = defineServer(fragmentContract)
    const fragment = server.implement(fragmentContract.routes.second, () => ({ status: 200, body: 'second' }))
    const testServer = await listen(nodeHttpAdapter().mount(fragment))

    try {
      const first = await fetch(`${testServer.origin}/first`)
      expect(first.status).toBe(404)
      const second = await fetch(`${testServer.origin}/second`)
      expect(second.status).toBe(200)
      await expect(second.text()).resolves.toBe('second')
    } finally {
      await close(testServer.server)
    }
  })
})

test('returns 413 over a real chunked connection and remains usable afterwards', async () => {
  const handler = nodeHttpAdapter({ maxBodyBytes: 4 }).mount(implementation())
  const running = await listen(handler)
  try {
    const oversized = await fetch(`${running.origin}/api/text`, {
      method: 'POST',
      headers: { 'content-type': 'text/plain' },
      body: new ReadableStream({
        start(controller) {
          controller.enqueue(new TextEncoder().encode('too long'))
          controller.close()
        },
      }),
      duplex: 'half',
    } as RequestInit)
    expect(oversized.status).toBe(413)
    await oversized.text()
    const normal = await fetch(`${running.origin}/api/text`, {
      method: 'POST',
      headers: { 'content-type': 'text/plain' },
      body: 'ok',
    })
    expect(await normal.text()).toBe('OK')
  } finally {
    await close(running.server)
  }
})

test('aborts cooperative stream work and finalizes its producer on disconnect', async () => {
  let finish!: () => void
  const finalized = new Promise<void>((resolve) => {
    finish = resolve
  })
  let observed: AbortSignal | undefined
  const streamContract = defineContract({ routes: { get: route.get('/', { responses: { 200: response.stream() } }) } })
  const server = defineServer(streamContract).implement({
    get: ({ signal }) => {
      observed = signal
      return {
        status: 200,
        body: (async function* () {
          try {
            yield new Uint8Array(256 * 1024)
            await new Promise<void>((resolve) => {
              if (signal.aborted) resolve()
              else signal.addEventListener('abort', () => resolve(), { once: true })
            })
          } finally {
            finish()
          }
        })(),
      }
    },
  })
  const running = await listen(nodeHttpAdapter().mount(server))
  try {
    const result = await fetch(running.origin)
    const reader = result.body!.getReader()
    await reader.read()
    await reader.cancel()
    await finalized
    expect(observed?.aborted).toBe(true)
  } finally {
    running.server.closeAllConnections()
    await close(running.server)
  }
})

test('accepts a chunked request above the former 1 MiB cap by default', async () => {
  const running = await listen(nodeHttpAdapter().mount(implementation()))
  try {
    const result = await fetch(`${running.origin}/api/bytes`, {
      method: 'POST',
      headers: { 'content-type': 'application/octet-stream' },
      body: new ReadableStream({
        start(controller) {
          controller.enqueue(new Uint8Array(1_048_576))
          controller.enqueue(new Uint8Array([255]))
          controller.close()
        },
      }),
      duplex: 'half',
    } as RequestInit)
    expect(result.status).toBe(200)
    const bytes = new Uint8Array(await result.arrayBuffer())
    expect(bytes.length).toBe(1_048_577)
    expect(bytes.at(-1)).toBe(255)
  } finally {
    await close(running.server)
  }
})
