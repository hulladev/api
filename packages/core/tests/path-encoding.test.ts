import { expect, test, vi } from 'vitest'
import { z } from 'zod'
import { defineContract, response, route } from '../src'
import { defineClient } from '../src/client'
import { fetchTransport } from '../src/fetch'

test.each(['get', 'delete'] as const)('%s rejects dot path parameters before sending a request', async (method) => {
  const contract = defineContract({
    routes: {
      item: route[method]('/items/:id', {
        params: z.object({ id: z.string() }),
        responses: { 200: response.text() },
      }),
    },
  })
  const fetch = vi.fn<(request: Request) => Response>(
    () => new Response('ok', { headers: { 'content-type': 'text/plain' } })
  )
  const client = defineClient(contract, { transport: fetchTransport({ baseUrl: 'https://example.test/api', fetch }) })
  for (const id of ['.', '..']) {
    await expect(client.item({ params: { id } })).rejects.toThrow('cannot be a dot segment')
  }
  expect(fetch).not.toHaveBeenCalled()
  await client.item({ params: { id: 'v1.2' } })
  expect(fetch).toHaveBeenCalledWith(
    expect.objectContaining({ url: 'https://example.test/api/items/v1.2', method: method.toUpperCase() })
  )
})
