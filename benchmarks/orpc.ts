import { createORPCClient } from '@orpc/client'
import { RPCLink } from '@orpc/client/fetch'
import { os, type RouterClient } from '@orpc/server'
import { RPCHandler } from '@orpc/server/fetch'
import type { Benchmark } from './harness'
import { assertCreatedUser, createUserInput, createUserOutput, createUserValue, createdUserValue } from './scenario'

/** oRPC's Fetch RPC client and handler. */
const router = {
  createUser: os
    .input(createUserInput)
    .output(createUserOutput)
    .handler(() => createdUserValue),
}
const handler = new RPCHandler(router)
const link = new RPCLink({
  url: 'https://bench.local/rpc',
  fetch: async (request, init) => {
    const result = await handler.handle(new Request(request, init), { prefix: '/rpc', context: {} })
    return result.matched ? result.response : new Response(null, { status: 404 })
  },
})
const client: RouterClient<typeof router> = createORPCClient(link)

export const orpcBenchmark: Benchmark = {
  name: 'oRPC',
  async run() {
    const input = createUserInput.parse(createUserValue)
    assertCreatedUser(await client.createUser(input))
  },
}
