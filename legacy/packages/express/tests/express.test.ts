import { describe, expect, test } from 'vitest'
import { createExpressMiddleware } from '../src'

describe('Express adapter', () => {
  test('bridges Express requests to Fetch handlers', async () => {
    let request: Request | undefined
    const middleware = createExpressMiddleware({
      async fetch(value) {
        request = value
        return new Response('ok', { status: 201, headers: { 'x-test': 'yes' } })
      },
    })
    let status = 0
    let body: unknown
    const headers = new Map<string, string | readonly string[]>()
    await middleware(
      {
        method: 'POST',
        url: '/api/todos/list',
        protocol: 'https',
        headers: { host: 'example.com', 'content-type': 'application/json' },
        body: { tagged: true },
      },
      {
        status(value) {
          status = value
          return this
        },
        setHeader(name, value) {
          headers.set(name, value)
        },
        send(value) {
          body = value
        },
      },
      (error) => {
        if (error) throw error
      }
    )

    expect(request?.url).toBe('https://example.com/api/todos/list')
    expect(await request?.json()).toEqual({ tagged: true })
    expect(status).toBe(201)
    expect(headers.get('x-test')).toBe('yes')
    expect(new TextDecoder().decode(body as Uint8Array)).toBe('ok')
  })

  test('forwards propagated Fetch handler failures to Express', async () => {
    const failure = new Error('handler failed')
    const middleware = createExpressMiddleware({
      async fetch() {
        throw failure
      },
    })
    let forwarded: unknown

    await middleware(
      { method: 'GET', url: '/api/failure', headers: { host: 'example.com' } },
      {
        status() {
          return this
        },
        setHeader() {},
        send() {},
      },
      (error) => {
        forwarded = error
      }
    )

    expect(forwarded).toBe(failure)
  })
})
