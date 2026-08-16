import { zValidator } from '@hono/zod-validator'
import { Hono } from 'hono'
import { hc } from 'hono/client'
import type { Benchmark } from './harness'
import { assertCreatedUser, createUserInput, createUserOutput, createUserValue, createdUserValue } from './scenario'

/** Hono's server-derived RPC client and Fetch application. */
const app = new Hono().post('/users', zValidator('json', createUserInput), (context) => {
  context.req.valid('json')
  return context.json(createUserOutput.parse(createdUserValue), 201)
})
const inMemoryFetch: typeof globalThis.fetch = async (input, init) => app.fetch(new Request(input, init))
const client = hc<typeof app>('https://bench.local', {
  fetch: inMemoryFetch,
})

export const honoBenchmark: Benchmark = {
  name: 'Hono RPC',
  async run() {
    const input = createUserInput.parse(createUserValue)
    const response = await client.users.$post({ json: input })
    assertCreatedUser(await response.json())
  },
}
