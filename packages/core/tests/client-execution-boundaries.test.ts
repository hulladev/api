import { expect, test, vi } from 'vitest'
import { defineContract, response, route } from '../src'
import { defineClient } from '../src/client'

test.each([false, true])('preserves decoding errors and cleanup with middleware=%s', async (middleware) => {
  const contract = defineContract({ routes: { item: route.get('/', { responses: { 200: response.json() } }) } })
  for (const asynchronous of [false, true]) {
    const primary = new Error('body read failed')
    const cleanup = new Error('cleanup failed')
    const dispose = vi.fn<(reason?: unknown) => Promise<void>>(async () => {
      throw cleanup
    })
    const fail = () => {
      throw primary
    }
    const wire = {
      status: 200,
      headers: { 'content-type': 'application/json' },
      dispose,
      readBody: asynchronous ? async () => fail() : fail,
    }
    const base = defineClient(contract, { transport: asynchronous ? async () => wire : () => wire })
    const client = middleware ? base.use(base.middleware(({ next }) => next())) : base
    const result = client.item()
    expect(result).toBeInstanceOf(Promise)
    await expect(result).rejects.toBe(primary)
    expect(dispose).toHaveBeenCalledExactlyOnceWith(primary)
  }
})

test.each([false, true])(
  'rejects undeclared statuses without consuming the body, middleware=%s',
  async (middleware) => {
    const contract = defineContract({ routes: { item: route.get('/', { responses: { 200: response.json() } }) } })
    const readBody = vi.fn<() => unknown>(() => ({ ok: true }))
    const dispose = vi.fn<(reason?: unknown) => void>()
    const base = defineClient(contract, { transport: async () => ({ status: 418, headers: {}, readBody, dispose }) })
    const client = middleware ? base.use(base.middleware(({ next }) => next())) : base
    await expect(client.item()).rejects.toMatchObject({ code: 'unexpected-status' })
    expect(readBody).not.toHaveBeenCalled()
    expect(dispose).toHaveBeenCalledOnce()
  }
)
