import { createORPCClient } from '@orpc/client'
import { RPCLink } from '@orpc/client/fetch'
import { os, type RouterClient } from '@orpc/server'
import { RPCHandler } from '@orpc/server/fetch'
import type { Benchmark } from './harness'
import {
  assertCreatedUser,
  assertHealth,
  assertLarge,
  createUserInput,
  createUserOutput,
  createUserValue,
  createdUserValue,
  encodeValue,
  healthOutput,
  healthValue,
  largeInput,
  largeOutput,
  largeResult,
  largeValue,
} from './scenario'

/** oRPC's Fetch RPC client and handler. */
const router = {
  health: os.handler(() => encodeValue(healthOutput, healthValue)),
  createUser: os.input(createUserInput).handler(() => encodeValue(createUserOutput, createdUserValue)),
  large: os.input(largeInput).handler(() => encodeValue(largeOutput, largeResult)),
}
const handler = new RPCHandler(router)
const link = new RPCLink({
  url: 'https://bench.local/rpc',
  fetch: async (request, init) => {
    const incoming = request instanceof Request && init === undefined ? request : new Request(request, init)
    const result = await handler.handle(incoming, { prefix: '/rpc', context: {} })
    return result.matched ? result.response : new Response(null, { status: 404 })
  },
})
const client: RouterClient<typeof router> = createORPCClient(link)

const nativeRouter = {
  health: os.output(healthOutput).handler(() => healthValue),
  createUser: os
    .input(createUserInput)
    .output(createUserOutput)
    .handler(() => createdUserValue),
  large: os
    .input(largeInput)
    .output(largeOutput)
    .handler(() => largeResult),
}
const nativeHandler = new RPCHandler(nativeRouter)
const nativeLink = new RPCLink({
  url: 'https://bench.local/rpc',
  fetch: async (request, init) => {
    const incoming = request instanceof Request && init === undefined ? request : new Request(request, init)
    const result = await nativeHandler.handle(incoming, { prefix: '/rpc', context: {} })
    return result.matched ? result.response : new Response(null, { status: 404 })
  },
})
const nativeClient: RouterClient<typeof nativeRouter> = createORPCClient(nativeLink)

export const orpcNativeBenchmarks: readonly Benchmark[] = [
  {
    profile: 'native',
    runtime: 'oRPC',
    scenario: 'static-get',
    async run() {
      if (!(await nativeClient.health()).ok) throw new Error('Unexpected health result')
    },
  },
  {
    profile: 'native',
    runtime: 'oRPC',
    scenario: 'small-json-post',
    async run() {
      if ((await nativeClient.createUser(createUserValue)).id !== 'user-1') throw new Error('Unexpected result')
    },
  },
  {
    profile: 'native',
    runtime: 'oRPC',
    scenario: 'large-json-post',
    async run() {
      if ((await nativeClient.large(largeValue)).count !== 100) throw new Error('Unexpected large result')
    },
  },
]

export const orpcBenchmarks: readonly Benchmark[] = [
  {
    runtime: 'oRPC',
    scenario: 'static-get',
    async run() {
      assertHealth(await client.health())
    },
  },
  {
    runtime: 'oRPC',
    scenario: 'small-json-post',
    async run() {
      assertCreatedUser(await client.createUser(encodeValue(createUserInput, createUserValue)))
    },
  },
  {
    runtime: 'oRPC',
    scenario: 'large-json-post',
    async run() {
      assertLarge(await client.large(encodeValue(largeInput, largeValue)))
    },
  },
]
