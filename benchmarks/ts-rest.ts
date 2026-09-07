import { initClient, initContract, type ApiFetcher, type AppRouteMutation, type AppRouteQuery } from '@ts-rest/core'
import { createFetchHandler, tsr } from '@ts-rest/serverless/fetch'
import type { z } from 'zod'
import {
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

/** ts-rest uses plain contract types here because its stable release peers on Zod 3. */
type CreateUserInput = z.infer<typeof createUserInput>
type CreateUserOutput = z.infer<typeof createUserOutput>
type HealthOutput = z.infer<typeof healthOutput>
type LargeInput = z.infer<typeof largeInput>
type LargeOutput = z.infer<typeof largeOutput>
type CollectionOutput = z.infer<typeof collectionOutput>
type OrganizationParams = z.infer<typeof organizationParams>
type ResourceHeaders = z.infer<typeof resourceHeaders>
type ResourceOutput = z.infer<typeof resourceOutput>
type ResourceParams = z.infer<typeof resourceParams>
type ResourceQuery = z.infer<typeof resourceQuery>
type UpdateBody = z.infer<typeof updateBody>
type UpdateQuery = z.infer<typeof updateQuery>

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
const resourceRoute = {
  method: 'GET',
  path: '/organizations/:organizationId/users/:userId',
  pathParams: c.type<ResourceParams>(),
  responses: { 200: c.type<ResourceOutput>() },
} satisfies AppRouteQuery
const collectionRoute = {
  method: 'GET',
  path: '/organizations/:organizationId/users',
  pathParams: c.type<OrganizationParams>(),
  query: c.type<ResourceQuery>(),
  headers: c.type<ResourceHeaders>(),
  responses: { 200: c.type<CollectionOutput>() },
} satisfies AppRouteQuery
const updateRoute = {
  method: 'PATCH',
  path: '/organizations/:organizationId/users/:userId',
  pathParams: c.type<ResourceParams>(),
  query: c.type<UpdateQuery>(),
  headers: c.type<ResourceHeaders>(),
  body: c.type<UpdateBody>(),
  responses: { 200: c.type<ResourceOutput>() },
} satisfies AppRouteMutation
const contract: {
  readonly health: AppRouteQuery
  readonly createUser: AppRouteMutation
  readonly large: AppRouteMutation
  readonly resource: typeof resourceRoute
  readonly collection: typeof collectionRoute
  readonly update: typeof updateRoute
} = {
  health: healthRoute,
  createUser: createUserRoute,
  large: largeRoute,
  resource: resourceRoute,
  collection: collectionRoute,
  update: updateRoute,
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
  resource: async ({ params }) => {
    const parsed = resourceParams.parse(params)
    return { status: 200, body: encodeValue(resourceOutput, { ...resourceResult, ...parsed }) }
  },
  collection: async ({ params, query, headers }) => {
    const parsedParams = organizationParams.parse(params)
    const parsedQuery = resourceQuery.parse(query)
    const parsedHeaders = resourceHeaders.parse(headers)
    return {
      status: 200,
      body: encodeValue(collectionOutput, {
        ...collectionResult,
        organizationId: parsedParams.organizationId,
        cursor: parsedQuery.cursor,
        limit: Number(parsedQuery.limit),
        roles: parsedQuery.role,
        token: parsedHeaders['x-tenant-token'],
      }),
    }
  },
  update: async ({ params, query, headers, body }) => {
    const parsedParams = resourceParams.parse(params)
    updateQuery.parse(query)
    resourceHeaders.parse(headers)
    const parsedBody = updateBody.parse(body)
    return { status: 200, body: encodeValue(resourceOutput, { ...parsedParams, ...parsedBody }) }
  },
})
const handler = createFetchHandler(contract, router, { jsonQuery: true })
const api: ApiFetcher = async ({ path, method, headers, body, validateResponse }) => {
  const response = await handler(
    new Request(path, {
      method,
      headers,
      ...(body === undefined ? {} : { body }),
    })
  )
  const responseBody = await response.json()
  const pathname = new URL(path).pathname
  const validatedBody = validateResponse
    ? pathname.endsWith('/health')
      ? healthOutput.parse(responseBody)
      : pathname.endsWith('/large')
        ? largeOutput.parse(responseBody)
        : pathname.includes('/organizations/')
          ? pathname.endsWith('/users')
            ? collectionOutput.parse(responseBody)
            : resourceOutput.parse(responseBody)
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
  jsonQuery: true,
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
  resource: async ({ params }) => ({ status: 200, body: { ...resourceResult, ...resourceParams.parse(params) } }),
  collection: async ({ params, query, headers }) => ({
    status: 200,
    body: {
      ...collectionResult,
      organizationId: organizationParams.parse(params).organizationId,
      cursor: resourceQuery.parse(query).cursor,
      limit: Number(resourceQuery.parse(query).limit),
      roles: resourceQuery.parse(query).role,
      token: resourceHeaders.parse(headers)['x-tenant-token'],
    },
  }),
  update: async ({ params, query, headers, body }) => {
    updateQuery.parse(query)
    resourceHeaders.parse(headers)
    return { status: 200, body: { ...resourceParams.parse(params), ...updateBody.parse(body) } }
  },
})
const nativeHandler = createFetchHandler(contract, nativeRouter, { jsonQuery: true })
const nativeApi: ApiFetcher = async ({ path, method, headers, body, validateResponse }) => {
  const response = await nativeHandler(new Request(path, { method, headers, ...(body === undefined ? {} : { body }) }))
  const responseBody = await response.json()
  const pathname = new URL(path).pathname
  const validatedBody = validateResponse
    ? pathname.endsWith('/health')
      ? healthOutput.parse(responseBody)
      : pathname.endsWith('/large')
        ? largeOutput.parse(responseBody)
        : pathname.includes('/organizations/')
          ? pathname.endsWith('/users')
            ? collectionOutput.parse(responseBody)
            : resourceOutput.parse(responseBody)
          : createUserOutput.parse(responseBody)
    : responseBody
  return { status: response.status, headers: response.headers, body: validatedBody }
}
const nativeClient = initClient(contract, {
  baseUrl: 'https://bench.local',
  api: nativeApi,
  jsonQuery: true,
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
      const result = await client.createUser({ body: createUserValue, query: undefined })
      if (result.status !== 201) throw new Error('Unexpected benchmark status')
      const output = result.body as CreateUserOutput
      if (output.id !== 'user-1' || output.name !== 'Ada') throw new Error('Unexpected benchmark result')
    },
  },
  {
    runtime: 'ts-rest',
    scenario: 'large-json-post',
    async run() {
      const result = await client.large({ body: largeValue, query: undefined })
      if (result.status !== 200 || (result.body as LargeOutput).count !== 100) {
        throw new Error('Unexpected large result')
      }
    },
  },
]

export const tsRestApplicationBenchmarks: readonly Benchmark[] = [
  {
    profile: 'application',
    runtime: 'ts-rest',
    scenario: 'path-parameter-read',
    async run() {
      const result = await client.resource({ params: resourceValue })
      if (result.status !== 200 || (result.body as ResourceOutput).userId !== resourceValue.userId) {
        throw new Error('Unexpected resource')
      }
    },
  },
  {
    profile: 'application',
    runtime: 'ts-rest',
    scenario: 'query-header-read',
    async run() {
      const result = await client.collection({
        params: { organizationId: resourceValue.organizationId },
        query: queryValue,
        headers: headerValue,
      })
      if (result.status !== 200 || (result.body as CollectionOutput).roles.length !== 2) {
        throw new Error('Unexpected collection')
      }
    },
  },
  {
    profile: 'application',
    runtime: 'ts-rest',
    scenario: 'mixed-update',
    async run() {
      const result = await client.update({
        params: resourceValue,
        query: updateQueryValue,
        headers: headerValue,
        body: updateBodyValue,
      })
      if (result.status !== 200 || (result.body as ResourceOutput).displayName !== updateBodyValue.displayName) {
        throw new Error('Unexpected update')
      }
    },
  },
]
