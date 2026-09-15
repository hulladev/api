import { createTRPCClient, httpLink } from '@trpc/client'
import { initTRPC } from '@trpc/server'
import { fetchRequestHandler } from '@trpc/server/adapters/fetch'
import { z } from 'zod'
import {
  assertCreatedUser,
  assertCollection,
  assertHealth,
  assertLarge,
  assertResource,
  collectionOutput,
  collectionResult,
  createUserInput,
  createUserOutput,
  createUserValue,
  createdUserValue,
  encodeValue,
  healthOutput,
  healthValue,
  headerValue,
  largeInput,
  largeOutput,
  largeResult,
  largeValue,
  organizationParams,
  queryValue,
  resourceHeaders,
  resourceOutput,
  resourceParams,
  resourceQuery,
  resourceResult,
  resourceValue,
  updateBody,
  updateBodyValue,
  updateQuery,
  updateQueryValue,
} from './fixtures/scenario'
import type { Benchmark } from './harness'

/** tRPC's HTTP client link and Fetch adapter. */
const t = initTRPC.create()
const appRouter = t.router({
  health: t.procedure.query(() => encodeValue(healthOutput, healthValue)),
  createUser: t.procedure.input(createUserInput).mutation(() => encodeValue(createUserOutput, createdUserValue)),
  large: t.procedure.input(largeInput).mutation(() => encodeValue(largeOutput, largeResult)),
  resource: t.procedure
    .input(resourceParams)
    .query(({ input }) => encodeValue(resourceOutput, { ...resourceResult, ...input })),
  collection: t.procedure
    .input(z.object({ params: organizationParams, query: resourceQuery, headers: resourceHeaders }))
    .query(({ input }) =>
      encodeValue(collectionOutput, {
        ...collectionResult,
        organizationId: input.params.organizationId,
        cursor: input.query.cursor,
        limit: Number(input.query.limit),
        roles: input.query.role,
        token: input.headers['x-tenant-token'],
      })
    ),
  update: t.procedure
    .input(z.object({ params: resourceParams, query: updateQuery, headers: resourceHeaders, body: updateBody }))
    .mutation(({ input }) => encodeValue(resourceOutput, { ...input.params, ...input.body })),
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
      assertCreatedUser(await client.createUser.mutate(createUserValue))
    },
  },
  {
    runtime: 'tRPC',
    scenario: 'large-json-post',
    async run() {
      assertLarge(await client.large.mutate(largeValue))
    },
  },
]

export const trpcApplicationBenchmarks: readonly Benchmark[] = [
  {
    profile: 'application',
    runtime: 'tRPC',
    scenario: 'path-parameter-read',
    async run() {
      assertResource(await client.resource.query(resourceValue))
    },
  },
  {
    profile: 'application',
    runtime: 'tRPC',
    scenario: 'query-header-read',
    async run() {
      assertCollection(
        await client.collection.query({
          params: { organizationId: resourceValue.organizationId },
          query: queryValue,
          headers: headerValue,
        })
      )
    },
  },
  {
    profile: 'application',
    runtime: 'tRPC',
    scenario: 'mixed-update',
    async run() {
      assertResource(
        await client.update.mutate({
          params: resourceValue,
          query: updateQueryValue,
          headers: headerValue,
          body: updateBodyValue,
        })
      )
    },
  },
]
