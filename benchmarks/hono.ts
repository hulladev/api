import { zValidator } from '@hono/zod-validator'
import { Hono } from 'hono'
import { hc } from 'hono/client'
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

/** Hono's server-derived RPC client and Fetch application. */
const app = new Hono()
  .get('/health', (context) => context.json(encodeValue(healthOutput, healthValue)))
  .post('/users', zValidator('json', createUserInput), (context) => {
    context.req.valid('json')
    return context.json(encodeValue(createUserOutput, createdUserValue), 201)
  })
  .post('/large', zValidator('json', largeInput), (context) => {
    context.req.valid('json')
    return context.json(encodeValue(largeOutput, largeResult))
  })
const inMemoryFetch: typeof globalThis.fetch = async (input, init) => app.fetch(new Request(input, init))
const client = hc<typeof app>('https://bench.local', {
  fetch: inMemoryFetch,
})

const nativeApp = new Hono()
  .get('/health', (context) => context.json(healthValue))
  .post('/users', zValidator('json', createUserInput), (context) => {
    context.req.valid('json')
    return context.json(createdUserValue, 201)
  })
  .post('/large', zValidator('json', largeInput), (context) => {
    context.req.valid('json')
    return context.json(largeResult)
  })
const nativeFetch: typeof globalThis.fetch = async (input, init) => nativeApp.fetch(new Request(input, init))
const nativeClient = hc<typeof nativeApp>('https://bench.local', { fetch: nativeFetch })

export const honoNativeBenchmarks: readonly Benchmark[] = [
  {
    profile: 'native',
    runtime: 'Hono RPC',
    scenario: 'static-get',
    async run() {
      if (!(await (await nativeClient.health.$get()).json()).ok) throw new Error('Unexpected health result')
    },
  },
  {
    profile: 'native',
    runtime: 'Hono RPC',
    scenario: 'small-json-post',
    async run() {
      const result = await (await nativeClient.users.$post({ json: createUserValue })).json()
      if (!('id' in result) || result.id !== 'user-1') {
        throw new Error('Unexpected result')
      }
    },
  },
  {
    profile: 'native',
    runtime: 'Hono RPC',
    scenario: 'large-json-post',
    async run() {
      const result = await (await nativeClient.large.$post({ json: largeValue })).json()
      if (!('count' in result) || result.count !== 100) {
        throw new Error('Unexpected large result')
      }
    },
  },
]

export const honoBenchmarks: readonly Benchmark[] = [
  {
    runtime: 'Hono RPC',
    scenario: 'static-get',
    async run() {
      assertHealth(await (await client.health.$get()).json())
    },
  },
  {
    runtime: 'Hono RPC',
    scenario: 'small-json-post',
    async run() {
      const input = encodeValue(createUserInput, createUserValue)
      assertCreatedUser(await (await client.users.$post({ json: input })).json())
    },
  },
  {
    runtime: 'Hono RPC',
    scenario: 'large-json-post',
    async run() {
      const input = encodeValue(largeInput, largeValue)
      assertLarge(await (await client.large.$post({ json: input })).json())
    },
  },
]
