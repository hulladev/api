import { zValidator } from '@hono/zod-validator'
import { Hono } from 'hono'
import { hc } from 'hono/client'
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
  .get('/organizations/:organizationId/users/:userId', zValidator('param', resourceParams), (context) => {
    const params = context.req.valid('param')
    return context.json(encodeValue(resourceOutput, { ...resourceResult, ...params }))
  })
  .get(
    '/organizations/:organizationId/users',
    zValidator('param', organizationParams),
    zValidator('query', resourceQuery),
    zValidator('header', resourceHeaders),
    (context) => {
      const params = context.req.valid('param')
      const query = context.req.valid('query')
      const headers = context.req.valid('header')
      return context.json(
        encodeValue(collectionOutput, {
          ...collectionResult,
          organizationId: params.organizationId,
          cursor: query.cursor,
          limit: Number(query.limit),
          roles: query.role,
          token: headers['x-tenant-token'],
        })
      )
    }
  )
  .patch(
    '/organizations/:organizationId/users/:userId',
    zValidator('param', resourceParams),
    zValidator('query', updateQuery),
    zValidator('header', resourceHeaders),
    zValidator('json', updateBody),
    (context) => {
      const params = context.req.valid('param')
      const body = context.req.valid('json')
      return context.json(encodeValue(resourceOutput, { ...params, ...body }))
    }
  )
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
      const input = createUserValue
      assertCreatedUser(await (await client.users.$post({ json: input })).json())
    },
  },
  {
    runtime: 'Hono RPC',
    scenario: 'large-json-post',
    async run() {
      const input = largeValue
      assertLarge(await (await client.large.$post({ json: input })).json())
    },
  },
]

export const honoApplicationBenchmarks: readonly Benchmark[] = [
  {
    profile: 'application',
    runtime: 'Hono RPC',
    scenario: 'path-parameter-read',
    async run() {
      const response = await client.organizations[':organizationId'].users[':userId'].$get({
        param: resourceValue,
      })
      assertResource(await response.json())
    },
  },
  {
    profile: 'application',
    runtime: 'Hono RPC',
    scenario: 'query-header-read',
    async run() {
      const response = await client.organizations[':organizationId'].users.$get({
        param: { organizationId: resourceValue.organizationId },
        query: queryValue,
        header: headerValue,
      })
      assertCollection(await response.json())
    },
  },
  {
    profile: 'application',
    runtime: 'Hono RPC',
    scenario: 'mixed-update',
    async run() {
      const response = await client.organizations[':organizationId'].users[':userId'].$patch({
        param: resourceValue,
        query: updateQueryValue,
        header: headerValue,
        json: updateBodyValue,
      })
      assertResource(await response.json())
    },
  },
]
