import { expect, test, vi } from 'vitest'
import { defineContract, response, route } from '../src'
import { createClient } from '../src/client'

test.each([false, true])(
  'closes a failed stream and preserves its error when cleanup fails=%s',
  async (cleanupFails) => {
    const primary = new Error('producer failed')
    const dispose = vi.fn<(reason?: unknown) => void>((reason) => {
      expect(reason).toBe(primary)
      if (cleanupFails) throw new Error('dispose failed')
    })
    const finish = vi.fn<() => Promise<IteratorResult<Uint8Array>>>(async () => {
      if (cleanupFails) throw new Error('return failed')
      return { done: true as const, value: undefined }
    })
    const next = vi.fn<() => Promise<IteratorResult<Uint8Array>>>(async () => {
      throw primary
    })
    const source = {
      [Symbol.asyncIterator]() {
        return this
      },
      next,
      return: finish,
    }
    const contract = defineContract({ routes: { item: route.get('/', { responses: { 200: response.stream() } }) } })
    const client = createClient(contract, {
      transport: () => ({
        status: 200,
        headers: { 'content-type': 'application/octet-stream' },
        readBody: () => source,
        dispose,
      }),
    })
    const result = await client.item()
    const iterator = result.body[Symbol.asyncIterator]()
    await expect(iterator.next()).rejects.toBe(primary)
    await expect(iterator.next()).rejects.toBe(primary)
    const cleanupError = await Promise.resolve(iterator.return!()).then(
      () => undefined,
      (error: Error) => error.message
    )
    expect(cleanupError).toBe(cleanupFails ? 'return failed' : undefined)
    expect(dispose).toHaveBeenCalledOnce()
    expect(finish).toHaveBeenCalledOnce()
    expect(next).toHaveBeenCalledOnce()
  }
)

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
    const client = createClient(contract, {
      middleware: middleware ? [({ next }) => next()] : [],
      transport: asynchronous ? async () => wire : () => wire,
    })
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
    const client = createClient(contract, {
      middleware: middleware ? [({ next }) => next()] : [],
      transport: async () => ({ status: 418, headers: {}, readBody, dispose }),
    })
    await expect(client.item()).rejects.toMatchObject({ code: 'unexpected-status' })
    expect(readBody).not.toHaveBeenCalled()
    expect(dispose).toHaveBeenCalledOnce()
  }
)
