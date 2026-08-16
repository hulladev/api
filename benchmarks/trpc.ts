import { createTRPCClient, httpLink } from '@trpc/client'
import { initTRPC } from '@trpc/server'
import { fetchRequestHandler } from '@trpc/server/adapters/fetch'
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

/** tRPC's HTTP client link and Fetch adapter. */
const t = initTRPC.create()
const appRouter = t.router({
  health: t.procedure.query(() => encodeValue(healthOutput, healthValue)),
  createUser: t.procedure.input(createUserInput).mutation(() => encodeValue(createUserOutput, createdUserValue)),
  large: t.procedure.input(largeInput).mutation(() => encodeValue(largeOutput, largeResult)),
})

const client = createTRPCClient<typeof appRouter>({
  links: [
    httpLink({
      url: 'https://bench.local/trpc',
      fetch: (input, init) =>
        fetchRequestHandler({
          endpoint: '/trpc',
          req: new Request(input, init as RequestInit | undefined),
          router: appRouter,
        }),
    }),
  ],
})

const nativeRouter = t.router({
  health: t.procedure.output(healthOutput).query(() => healthValue),
  createUser: t.procedure
    .input(createUserInput)
    .output(createUserOutput)
    .mutation(() => createdUserValue),
  large: t.procedure
    .input(largeInput)
    .output(largeOutput)
    .mutation(() => largeResult),
})
const nativeClient = createTRPCClient<typeof nativeRouter>({
  links: [
    httpLink({
      url: 'https://bench.local/trpc',
      fetch: (input, init) =>
        fetchRequestHandler({
          endpoint: '/trpc',
          req: new Request(input, init as RequestInit | undefined),
          router: nativeRouter,
        }),
    }),
  ],
})

export const trpcNativeBenchmarks: readonly Benchmark[] = [
  {
    profile: 'native',
    runtime: 'tRPC',
    scenario: 'static-get',
    async run() {
      if (!(await nativeClient.health.query()).ok) throw new Error('Unexpected health result')
    },
  },
  {
    profile: 'native',
    runtime: 'tRPC',
    scenario: 'small-json-post',
    async run() {
      if ((await nativeClient.createUser.mutate(createUserValue)).id !== 'user-1') {
        throw new Error('Unexpected benchmark result')
      }
    },
  },
  {
    profile: 'native',
    runtime: 'tRPC',
    scenario: 'large-json-post',
    async run() {
      if ((await nativeClient.large.mutate(largeValue)).count !== 100) throw new Error('Unexpected large result')
    },
  },
]

export const trpcBenchmarks: readonly Benchmark[] = [
  {
    runtime: 'tRPC',
    scenario: 'static-get',
    async run() {
      assertHealth(await client.health.query())
    },
  },
  {
    runtime: 'tRPC',
    scenario: 'small-json-post',
    async run() {
      assertCreatedUser(await client.createUser.mutate(encodeValue(createUserInput, createUserValue)))
    },
  },
  {
    runtime: 'tRPC',
    scenario: 'large-json-post',
    async run() {
      assertLarge(await client.large.mutate(encodeValue(largeInput, largeValue)))
    },
  },
]
