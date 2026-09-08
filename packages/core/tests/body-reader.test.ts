import { expect, test, vi } from 'vitest'
import { defineContract, request, response, route } from '../src'
import { readFetchBody } from '../src/adapters/web'
import { fetchAdapter } from '../src/fetch'
import { defineServer } from '../src/server'

function streamedRequest(chunks: readonly Uint8Array[], cancel = () => {}) {
  let index = 0
  const body = new ReadableStream<Uint8Array>({
    pull(controller) {
      if (index === chunks.length) controller.close()
      else controller.enqueue(chunks[index++]!)
    },
    cancel,
  })
  return new Request('https://body.test', { method: 'POST', body, duplex: 'half' } as RequestInit)
}

test('decodes UTF-8 split across chunks at the exact byte limit', async () => {
  const bytes = new TextEncoder().encode('"✓"')
  const request = streamedRequest([bytes.subarray(0, 2), bytes.subarray(2, 3), bytes.subarray(3)])
  expect(await readFetchBody(request, 'json', false, bytes.length)).toBe('✓')
  expect(request.body?.locked).toBe(false)
})

test('rejects bytes beyond the limit and cancels an unfinished producer', async () => {
  const cancel = vi.fn<() => void>()
  const request = streamedRequest([new Uint8Array(3), new Uint8Array(2), new Uint8Array(100)], cancel)
  await expect(readFetchBody(request, 'bytes', false, 4)).rejects.toThrow('Request body exceeds maxBodyBytes')
  expect(cancel).toHaveBeenCalledOnce()
  expect(request.body?.locked).toBe(false)
})

test('rejects a preserved branch without waiting for the original body to be consumed', async () => {
  const request = streamedRequest([new TextEncoder().encode('"too long"')])
  await expect(readFetchBody(request, 'json', true, 4)).rejects.toThrow('Request body exceeds maxBodyBytes')
  expect(await request.json()).toBe('too long')
})

test('retains producer errors and releases the reader', async () => {
  const request = new Request('https://body.test', {
    method: 'POST',
    body: new ReadableStream({
      start(controller) {
        controller.error(new Error('producer failed'))
      },
    }),
    duplex: 'half',
  } as RequestInit)
  await expect(readFetchBody(request, 'bytes', false, 100)).rejects.toThrow('producer failed')
  expect(request.body?.locked).toBe(false)
})

test('accepts an empty body at a zero byte limit', async () => {
  expect(await readFetchBody(streamedRequest([]), 'bytes', false, 0)).toEqual(new Uint8Array())
})

test('accepts a Fetch request above the former 1 MiB cap by default', async () => {
  const contract = defineContract({
    routes: {
      size: route.post('/', {
        body: request.bytes(),
        responses: { 200: response.text() },
      }),
    },
  })
  const handler = fetchAdapter().mount(
    defineServer(contract).implement({
      size: ({ body }) => ({ status: 200, body: String(body.length) }),
    })
  )
  const input = streamedRequest([new Uint8Array(1_048_576), new Uint8Array(1)])
  input.headers.set('content-type', 'application/octet-stream')
  expect(input.headers.has('content-length')).toBe(false)
  const result = await handler(input)
  expect(result.status).toBe(200)
  expect(await result.text()).toBe('1048577')
})
