import { initClient, initContract, type ApiFetcher, type AppRouteMutation, type AppRouteQuery } from '@ts-rest/core'
import { createFetchHandler, tsr } from '@ts-rest/serverless/fetch'
import type { z } from 'zod'
import type { Benchmark } from './harness'
import {
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

/** ts-rest uses plain contract types here because its stable release peers on Zod 3. */
type CreateUserInput = z.infer<typeof createUserInput>
type CreateUserOutput = z.infer<typeof createUserOutput>
type HealthOutput = z.infer<typeof healthOutput>
type LargeInput = z.infer<typeof largeInput>
type LargeOutput = z.infer<typeof largeOutput>

const c = initContract()
const healthRoute: AppRouteQuery = {
  method: 'GET',
  path: '/health',
  responses: { 200: c.type<HealthOutput>() },
}
const createUserRoute: AppRouteMutation = {
  method: 'POST',
  path: '/users',
  body: c.type<CreateUserInput>(),
  responses: { 201: c.type<CreateUserOutput>() },
}
const largeRoute: AppRouteMutation = {
  method: 'POST',
  path: '/large',
  body: c.type<LargeInput>(),
  responses: { 200: c.type<LargeOutput>() },
}
const contract: {
  readonly health: AppRouteQuery
  readonly createUser: AppRouteMutation
  readonly large: AppRouteMutation
} = {
  health: healthRoute,
  createUser: createUserRoute,
  large: largeRoute,
}
const router = tsr.router(contract, {
  health: async () => ({ status: 200, body: encodeValue(healthOutput, healthValue) }),
  createUser: async ({ body }) => {
    createUserInput.parse(body)
    return { status: 201, body: encodeValue(createUserOutput, createdUserValue) }
  },
  large: async ({ body }) => {
    largeInput.parse(body)
    return { status: 200, body: encodeValue(largeOutput, largeResult) }
  },
})
const handler = createFetchHandler(contract, router)
const api: ApiFetcher = async ({ path, method, headers, body, validateResponse }) => {
  const response = await handler(
    new Request(path, {
      method,
      headers,
      ...(body === undefined ? {} : { body }),
    })
  )
  const responseBody = await response.json()
  const validatedBody = validateResponse
    ? path.endsWith('/health')
      ? healthOutput.parse(responseBody)
      : path.endsWith('/large')
        ? largeOutput.parse(responseBody)
        : createUserOutput.parse(responseBody)
    : responseBody
  return {
    status: response.status,
    headers: response.headers,
    body: validatedBody,
  }
}
const client = initClient(contract, {
  baseUrl: 'https://bench.local',
  api,
  validateResponse: true,
})

const nativeRouter = tsr.router(contract, {
  health: async () => ({ status: 200, body: healthValue }),
  createUser: async ({ body }) => {
    createUserInput.parse(body)
    return { status: 201, body: createdUserValue }
  },
  large: async ({ body }) => {
    largeInput.parse(body)
    return { status: 200, body: largeResult }
  },
})
const nativeHandler = createFetchHandler(contract, nativeRouter)
const nativeApi: ApiFetcher = async ({ path, method, headers, body, validateResponse }) => {
  const response = await nativeHandler(new Request(path, { method, headers, ...(body === undefined ? {} : { body }) }))
  const responseBody = await response.json()
  const validatedBody = validateResponse
    ? path.endsWith('/health')
      ? healthOutput.parse(responseBody)
      : path.endsWith('/large')
        ? largeOutput.parse(responseBody)
        : createUserOutput.parse(responseBody)
    : responseBody
  return { status: response.status, headers: response.headers, body: validatedBody }
}
const nativeClient = initClient(contract, {
  baseUrl: 'https://bench.local',
  api: nativeApi,
  validateResponse: true,
})

export const tsRestNativeBenchmarks: readonly Benchmark[] = [
  {
    profile: 'native',
    runtime: 'ts-rest',
    scenario: 'static-get',
    async run() {
      const result = await nativeClient.health({ query: undefined })
      if (result.status !== 200 || !(result.body as HealthOutput).ok) throw new Error('Unexpected health result')
    },
  },
  {
    profile: 'native',
    runtime: 'ts-rest',
    scenario: 'small-json-post',
    async run() {
      const result = await nativeClient.createUser({ body: createUserValue, query: undefined })
      if (result.status !== 201 || (result.body as CreateUserOutput).id !== 'user-1') {
        throw new Error('Unexpected result')
      }
    },
  },
  {
    profile: 'native',
    runtime: 'ts-rest',
    scenario: 'large-json-post',
    async run() {
      const result = await nativeClient.large({ body: largeValue, query: undefined })
      if (result.status !== 200 || (result.body as LargeOutput).count !== 100) {
        throw new Error('Unexpected large result')
      }
    },
  },
]

export const tsRestBenchmarks: readonly Benchmark[] = [
  {
    runtime: 'ts-rest',
    scenario: 'static-get',
    async run() {
      const result = await client.health({ query: undefined })
      if (result.status !== 200 || !(result.body as HealthOutput).ok) throw new Error('Unexpected health result')
    },
  },
  {
    runtime: 'ts-rest',
    scenario: 'small-json-post',
    async run() {
      const result = await client.createUser({ body: encodeValue(createUserInput, createUserValue), query: undefined })
      if (result.status !== 201) throw new Error('Unexpected benchmark status')
      const output = result.body as CreateUserOutput
      if (output.id !== 'user-1' || output.name !== 'Ada') throw new Error('Unexpected benchmark result')
    },
  },
  {
    runtime: 'ts-rest',
    scenario: 'large-json-post',
    async run() {
      const result = await client.large({ body: encodeValue(largeInput, largeValue), query: undefined })
      if (result.status !== 200 || (result.body as LargeOutput).count !== 100) {
        throw new Error('Unexpected large result')
      }
    },
  },
]
