import { defineContract, response, route } from '@hulla/api'
import { createClient } from '@hulla/api/client'
import { fetchAdapter, fetchTransport } from '@hulla/api/fetch'
import { inProcessAdapter } from '@hulla/api/in-process'
import { defineServer } from '@hulla/api/server'
import {
  createUserInput,
  createUserOutput,
  createUserValue,
  createdUserValue,
  collectionOutput,
  headerValue,
  healthOutput,
  healthValue,
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

const contract = defineContract({
  routes: {
    health: route.get('/health', { responses: { 200: response.json(healthOutput) } }),
    createUser: route.post('/users', {
      body: createUserInput,
      responses: { 201: response.json(createUserOutput) },
    }),
    large: route.post('/large', {
      body: largeInput,
      responses: { 200: response.json(largeOutput) },
    }),
    resource: route.get('/organizations/:organizationId/users/:userId', {
      params: resourceParams,
      responses: { 200: response.json(resourceOutput) },
    }),
    collection: route.get('/organizations/:organizationId/users', {
      params: organizationParams,
      query: resourceQuery,
      headers: resourceHeaders,
      responses: { 200: response.json(collectionOutput) },
    }),
    update: route.patch('/organizations/:organizationId/users/:userId', {
      params: resourceParams,
      query: updateQuery,
      headers: resourceHeaders,
      body: updateBody,
      responses: { 200: response.json(resourceOutput) },
    }),
  },
})

const server = defineServer(contract)
const implementation = server.implement({
  health: () => ({ status: 200, body: healthValue }),
  createUser: () => ({ status: 201, body: createdUserValue }),
  large: () => ({ status: 200, body: largeResult }),
  resource: ({ params }) => ({ status: 200, body: { ...resourceResult, ...params } }),
  collection: ({ params, query, headers }) => ({
    status: 200,
    body: {
      organizationId: params.organizationId,
      cursor: query.cursor,
      limit: Number(query.limit),
      roles: query.role,
      token: headers['x-tenant-token'],
    },
  }),
  update: ({ params, body }) => ({ status: 200, body: { ...params, ...body } }),
})
const handler = fetchAdapter().mount(implementation)
const client = createClient(contract, {
  transport: fetchTransport({ baseUrl: 'https://bench.local', fetch: handler }),
})
const inProcessClient = createClient(contract, { transport: inProcessAdapter().mount(implementation) })

function basicBenchmarks(client: typeof inProcessClient, validateOutput = true): readonly Benchmark[] {
  return [
    {
      runtime: '@hulla/api',
      scenario: 'static-get',
      async run() {
        const result = await client.health()
        if (validateOutput) healthOutput.parse(result.body)
        if (result.status !== 200 || !result.body.ok) throw new Error('Unexpected health result')
      },
    },
    {
      runtime: '@hulla/api',
      scenario: 'small-json-post',
      async run() {
        const result = await client.createUser({ body: createUserValue })
        if (validateOutput) createUserOutput.parse(result.body)
        if (result.status !== 201 || result.body.id !== 'user-1') throw new Error('Unexpected benchmark result')
      },
    },
    {
      runtime: '@hulla/api',
      scenario: 'large-json-post',
      async run() {
        const result = await client.large({ body: largeValue })
        if (validateOutput) largeOutput.parse(result.body)
        if (result.status !== 200 || result.body.count !== 100) throw new Error('Unexpected large result')
      },
    },
  ]
}

export const hullaApiBenchmarks = basicBenchmarks(client)

export const hullaApiNativeBenchmarks: readonly Benchmark[] = basicBenchmarks(client, false).map((benchmark) => ({
  ...benchmark,
  profile: 'native',
}))

function applicationBenchmarks(client: typeof inProcessClient): readonly Benchmark[] {
  return [
    {
      profile: 'application',
      runtime: '@hulla/api',
      scenario: 'path-parameter-read',
      async run() {
        const result = await client.resource({ params: resourceValue })
        resourceOutput.parse(result.body)
        if (result.status !== 200 || result.body.userId !== resourceValue.userId) throw new Error('Unexpected resource')
      },
    },
    {
      profile: 'application',
      runtime: '@hulla/api',
      scenario: 'query-header-read',
      async run() {
        const result = await client.collection({
          params: { organizationId: resourceValue.organizationId },
          query: queryValue,
          headers: headerValue,
        })
        collectionOutput.parse(result.body)
        if (result.status !== 200 || result.body.roles.length !== 2) throw new Error('Unexpected collection')
      },
    },
    {
      profile: 'application',
      runtime: '@hulla/api',
      scenario: 'mixed-update',
      async run() {
        const result = await client.update({
          params: resourceValue,
          query: updateQueryValue,
          headers: headerValue,
          body: updateBodyValue,
        })
        resourceOutput.parse(result.body)
        if (result.status !== 200 || result.body.displayName !== updateBodyValue.displayName) {
          throw new Error('Unexpected update')
        }
      },
    },
  ]
}

export const hullaApiApplicationBenchmarks = applicationBenchmarks(client)
export const hullaApiInProcessBenchmarks: readonly Benchmark[] = [
  ...basicBenchmarks(inProcessClient),
  ...basicBenchmarks(inProcessClient, false).map((benchmark) => ({ ...benchmark, profile: 'native' as const })),
  ...applicationBenchmarks(inProcessClient),
].map((benchmark) => ({ ...benchmark, runtime: '@hulla/api in-process' }))
