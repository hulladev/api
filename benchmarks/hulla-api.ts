import { defineContract, response, route } from '@hulla/api'
import { defineClient } from '@hulla/api/client'
import { defineServer } from '@hulla/api/server'
import { createFetchHandler } from '@hulla/api/server'
import type { Benchmark } from './harness'
import {
  createUserInput,
  createUserOutput,
  createUserValue,
  createdUserValue,
  healthOutput,
  healthValue,
  largeInput,
  largeOutput,
  largeResult,
  largeValue,
} from './scenario'

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
  },
})

const server = defineServer(contract)
const handler = createFetchHandler(
  server.build({
    health: () => ({ status: 200, body: healthValue }),
    createUser: () => ({ status: 201, body: createdUserValue }),
    large: () => ({ status: 200, body: largeResult }),
  })
)
const client = defineClient(contract, { baseUrl: 'https://bench.local', fetch: handler }).build()

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
