import { defineContract, response, route } from '@hulla/api'
import { defineClient } from '@hulla/api/client'
import { createFetchHandler, fetchTransport } from '@hulla/api/fetch'
import { inProcessTransport } from '@hulla/api/in-process'
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
const handler = createFetchHandler(implementation)
const client = defineClient(contract, {
  transport: fetchTransport({ baseUrl: 'https://bench.local', fetch: handler }),
}).create()
const inProcessClient = defineClient(contract, { transport: inProcessTransport(implementation) }).create()

export const hullaApiBenchmarks: readonly Benchmark[] = [
  {
    runtime: '@hulla/api',
    scenario: 'static-get',
    async run() {
      const result = await client.health()
      if (result.status !== 200 || !result.body.ok) throw new Error('Unexpected health result')
    },
  },
  {
    runtime: '@hulla/api',
    scenario: 'small-json-post',
    async run() {
      const result = await client.createUser({ body: createUserValue })
      if (result.status !== 201 || result.body.id !== 'user-1') throw new Error('Unexpected benchmark result')
    },
  },
  {
    runtime: '@hulla/api',
    scenario: 'large-json-post',
    async run() {
      const result = await client.large({ body: largeValue })
      if (result.status !== 200 || result.body.count !== 100) throw new Error('Unexpected large result')
    },
  },
]

export const hullaApiNativeBenchmarks: readonly Benchmark[] = hullaApiBenchmarks.map((benchmark) => ({
  ...benchmark,
  profile: 'native',
}))

export const hullaApiInProcessBenchmarks: readonly Benchmark[] = [
  {
    runtime: '@hulla/api in-process',
    scenario: 'static-get',
    async run() {
      const result = await inProcessClient.health()
      if (result.status !== 200 || !result.body.ok) throw new Error('Unexpected in-process health result')
    },
  },
  {
    runtime: '@hulla/api in-process',
    scenario: 'small-json-post',
    async run() {
      const result = await inProcessClient.createUser({ body: createUserValue })
      if (result.status !== 201 || result.body.id !== 'user-1') throw new Error('Unexpected in-process result')
    },
  },
]

export const hullaApiApplicationBenchmarks: readonly Benchmark[] = [
  {
    profile: 'application',
    runtime: '@hulla/api',
    scenario: 'path-parameter-read',
    async run() {
      const result = await client.resource({ params: resourceValue })
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
      if (result.status !== 200 || result.body.displayName !== updateBodyValue.displayName) {
        throw new Error('Unexpected update')
      }
    },
  },
]
