import { createServer, type Server } from 'node:http'
import { defineContract, request, response, route } from '@hulla/api'
import { inProcessTransport } from '@hulla/api/in-process'
import { defineServer } from '@hulla/api/server'
import { describe, expect, expectTypeOf, test, vi } from 'vitest'
import { z } from 'zod'
import {
  googleCloudFunctionsAdapter,
  type GoogleCloudFunction,
  type GoogleCloudFunctionsContextInput,
  type GoogleCloudFunctionsRequest,
  type GoogleCloudFunctionsResponse,
  type GoogleCloudFunctionsServerErrorInput,
} from '../src'

type TestServer = {
  readonly origin: string
  readonly server: Server
}

async function listen(handler: GoogleCloudFunction): Promise<TestServer> {
  const server = createServer((requestValue, responseValue) => {
    const chunks: Buffer[] = []
    requestValue.on('data', (chunk: Buffer) => chunks.push(chunk))
    requestValue.on('end', () => {
      Object.assign(requestValue, {
        abortController: new AbortController(),
        executionId: 'execution-123',
        originalUrl: requestValue.url,
        protocol: 'http',
        rawBody: Buffer.concat(chunks),
        spanId: 'span-123',
      })
      void handler(requestValue as GoogleCloudFunctionsRequest, responseValue as GoogleCloudFunctionsResponse)
    })
  })
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
      query: z.object({ tag: z.string() }),
      headers: z.object({ 'x-actor': z.string() }),
      body: request.json(z.object({ name: z.string() })),
      responses: {
        201: response.json(
          z.object({ actor: z.string(), executionId: z.string(), id: z.string(), name: z.string(), tag: z.string() })
        ),
      },
    }),
    stream: route.get('/stream', {
      responses: { 200: response.stream({ contentType: 'application/octet-stream' }) },
    }),
    fail: route.get('/fail', { responses: { 200: response.text() } }),
  },
})

describe('Google Cloud Functions integration', () => {
  test('bridges Functions Framework requests and responses', async () => {
    let contextInput: GoogleCloudFunctionsContextInput<typeof contract> | undefined
    const adapter = googleCloudFunctionsAdapter()
    const implementation = defineServer(contract, {
      context: adapter.context((input) => {
        expectTypeOf(input.request).toEqualTypeOf<Request>()
        expectTypeOf(input.googleRequest).toEqualTypeOf<GoogleCloudFunctionsRequest>()
        expectTypeOf(input.response).toEqualTypeOf<GoogleCloudFunctionsResponse>()
        contextInput = input as GoogleCloudFunctionsContextInput<typeof contract>
        return { executionId: input.googleRequest.executionId ?? 'missing' }
      }),
    }).implement({
      create: ({ body, context, headers, params, query }) => ({
        status: 201,
        body: {
          actor: headers['x-actor'],
          executionId: context.executionId,
          id: params.id,
          name: body.name,
          tag: query.tag,
        },
      }),
      stream: () => ({
        status: 200,
        body: (async function* () {
          yield new Uint8Array([1, 2])
          yield new Uint8Array([3, 4])
        })(),
      }),
      fail: () => ({ status: 200, body: 'ok' }),
    })
    const handler = adapter.mount(implementation)
    const testServer = await listen(handler)

    try {
      expectTypeOf(handler).toEqualTypeOf<GoogleCloudFunction>()
      const result = await fetch(`${testServer.origin}/api/items/item%201?tag=typescript`, {
        method: 'POST',
        headers: { 'content-type': 'application/json', 'x-actor': 'Ada' },
        body: JSON.stringify({ name: 'Compiler' }),
      })

      expect(result.status).toBe(201)
      await expect(result.json()).resolves.toEqual({
        actor: 'Ada',
        executionId: 'execution-123',
        id: 'item 1',
        name: 'Compiler',
        tag: 'typescript',
      })
      expect(contextInput?.request).toBeInstanceOf(Request)
      expect(contextInput?.googleRequest.rawBody?.toString()).toBe('{"name":"Compiler"}')
      expect(contextInput?.googleRequest.spanId).toBe('span-123')
      expect(contextInput?.route).toEqual({ key: ['create'], method: 'POST', path: '/api/items/:id' })
      expect(() => inProcessTransport(implementation as never)).toThrow(
        'Server requires the google-cloud-functions adapter, but was mounted with in-process'
      )
    } finally {
      await close(testServer.server)
    }
  })

  test('streams responses and suppresses HEAD bodies', async () => {
    const implementation = defineServer(contract).implement({
      create: ({ body, headers, params, query }) => ({
        status: 201,
        body: {
          actor: headers['x-actor'],
          executionId: 'none',
          id: params.id,
          name: body.name,
          tag: query.tag,
        },
      }),
      stream: () => ({
        status: 200,
        body: (async function* () {
          yield new Uint8Array([1, 2])
          yield new Uint8Array([3, 4])
        })(),
      }),
      fail: () => ({ status: 200, body: 'ok' }),
    })
    const testServer = await listen(googleCloudFunctionsAdapter().mount(implementation))

    try {
      const stream = await fetch(`${testServer.origin}/api/stream`)
      expect(new Uint8Array(await stream.arrayBuffer())).toEqual(new Uint8Array([1, 2, 3, 4]))

      const head = await fetch(`${testServer.origin}/api/stream`, { method: 'HEAD' })
      expect(head.status).toBe(200)
      await expect(head.text()).resolves.toBe('')

      const missing = await fetch(`${testServer.origin}/api/missing`)
      expect(missing.status).toBe(404)
    } finally {
      await close(testServer.server)
    }
  })

  test('forwards Web and native request state to per-mount error hooks', async () => {
    const sharedError = vi.fn<(input: GoogleCloudFunctionsServerErrorInput) => void>()
    const mountError = vi.fn<(input: GoogleCloudFunctionsServerErrorInput) => void>()
    const adapter = googleCloudFunctionsAdapter({ onError: sharedError })
    const implementation = defineServer(contract).implement({
      create: ({ body, headers, params, query }) => ({
        status: 201,
        body: {
          actor: headers['x-actor'],
          executionId: 'none',
          id: params.id,
          name: body.name,
          tag: query.tag,
        },
      }),
      stream: () => ({
        status: 200,
        body: (async function* () {
          yield new Uint8Array()
        })(),
      }),
      fail: (): { readonly status: 200; readonly body: string } => {
        throw new Error('failure')
      },
    })
    const handler = adapter.mount(implementation, {
      onError(input) {
        expectTypeOf(input).toEqualTypeOf<GoogleCloudFunctionsServerErrorInput>()
        mountError(input)
        return new Response('replaced', {
          status: 503,
          headers: { 'x-error-phase': input.phase },
        })
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
          request: expect.any(Request),
          googleRequest: expect.objectContaining({ executionId: 'execution-123' }),
          response: expect.any(Object),
          route: { key: ['fail'], method: 'GET', path: '/api/fail' },
        })
      )
    } finally {
      await close(testServer.server)
    }
  })
})
