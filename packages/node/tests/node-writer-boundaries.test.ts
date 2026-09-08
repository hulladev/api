import type { ServerResponse } from 'node:http'
import { expect, test, vi } from 'vitest'
import { writeNodeResponse } from '../src'

test('rejects serialization through the public Promise before committing headers', async () => {
  const target = { setHeader: vi.fn<() => void>(), end: vi.fn<() => void>(), statusCode: 0 }
  const result = writeNodeResponse(
    { status: 200, headers: { 'content-type': 'application/json' }, body: { kind: 'json', value: 1n } },
    target as unknown as ServerResponse,
    'GET'
  )
  expect(result).toBeInstanceOf(Promise)
  await expect(result).rejects.toThrow(TypeError)
  expect(target.setHeader).not.toHaveBeenCalled()
  expect(target.end).not.toHaveBeenCalled()
  expect(target.statusCode).toBe(0)
})

test('awaits HEAD stream cleanup before ending the response without pulling the producer', async () => {
  let finish!: () => void
  const closing = new Promise<void>((resolve) => {
    finish = resolve
  })
  const next = vi.fn<() => Promise<IteratorResult<Uint8Array>>>(async () => ({
    done: false as const,
    value: new Uint8Array([1]),
  }))
  const close = vi.fn<() => Promise<IteratorResult<Uint8Array>>>(async () => {
    await closing
    return { done: true as const, value: undefined }
  })
  const stream = { [Symbol.asyncIterator]: () => ({ next, return: close }) }
  const target = { setHeader: vi.fn<() => void>(), end: vi.fn<() => void>(), statusCode: 0 }
  const result = writeNodeResponse(
    { status: 200, headers: {}, body: { kind: 'stream', value: stream } },
    target as unknown as ServerResponse,
    'HEAD'
  )
  expect(result).toBeInstanceOf(Promise)
  expect(close).toHaveBeenCalledOnce()
  expect(next).not.toHaveBeenCalled()
  expect(target.end).not.toHaveBeenCalled()
  finish()
  await result
  expect(target.end).toHaveBeenCalledOnce()
})
