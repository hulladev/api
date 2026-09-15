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

/** Lower-bound Fetch implementation without a contract framework. */
const handler = async (request: Request): Promise<Response> => {
  const path = new URL(request.url).pathname
  if (request.method === 'GET' && path === '/health') {
    return Response.json(encodeValue(healthOutput, healthValue))
  }
  if (request.method === 'POST' && path === '/users') {
    createUserInput.parse(await request.json())
    return Response.json(encodeValue(createUserOutput, createdUserValue), { status: 201 })
  }
  if (request.method === 'POST' && path === '/large') {
    largeInput.parse(await request.json())
    return Response.json(encodeValue(largeOutput, largeResult))
  }
  return new Response(null, { status: 404 })
}

/** Minimal Fetch path that validates values received across each side's trust boundary. */
const nativeHandler = async (request: Request): Promise<Response> => {
  const path = new URL(request.url).pathname
  if (request.method === 'GET' && path === '/health') return Response.json(healthValue)
  if (request.method === 'POST' && path === '/users') {
    createUserInput.parse(await request.json())
    return Response.json(createdUserValue, { status: 201 })
  }
  if (request.method === 'POST' && path === '/large') {
    largeInput.parse(await request.json())
    return Response.json(largeResult)
  }
  return new Response(null, { status: 404 })
}

async function applicationHandler(request: Request): Promise<Response> {
  const url = new URL(request.url)
  const segments = url.pathname.split('/').filter(Boolean).map(decodeURIComponent)
  if (segments[0] !== 'organizations' || segments[2] !== 'users') return new Response(null, { status: 404 })
  const organizationId = segments[1]
  const userId = segments[3]
  if (request.method === 'GET' && userId !== undefined) {
    const params = resourceParams.parse({ organizationId, userId })
    return Response.json(encodeValue(resourceOutput, { ...resourceResult, ...params }))
  }
  if (request.method === 'GET') {
    const params = organizationParams.parse({ organizationId })
    const query = resourceQuery.parse({
      cursor: url.searchParams.get('cursor'),
      limit: url.searchParams.get('limit'),
      role: url.searchParams.getAll('role'),
    })
    const headers = resourceHeaders.parse(Object.fromEntries(request.headers.entries()))
    return Response.json(
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
  if (request.method === 'PATCH' && userId !== undefined) {
    const params = resourceParams.parse({ organizationId, userId })
    updateQuery.parse({ notify: url.searchParams.get('notify') })
    resourceHeaders.parse(Object.fromEntries(request.headers.entries()))
    const body = updateBody.parse(await request.json())
    return Response.json(encodeValue(resourceOutput, { ...params, ...body }))
  }
  return new Response(null, { status: 404 })
}

function resourcePath(): string {
  return `/organizations/${encodeURIComponent(resourceValue.organizationId)}/users/${encodeURIComponent(resourceValue.userId)}`
}

export const directFetchApplicationBenchmarks: readonly Benchmark[] = [
  {
    profile: 'application',
    runtime: 'Direct Fetch',
    scenario: 'path-parameter-read',
    async run() {
      const params = resourceValue
      const response = await applicationHandler(
        new Request(
          `https://bench.local/organizations/${encodeURIComponent(params.organizationId)}/users/${encodeURIComponent(params.userId)}`
        )
      )
      assertResource(await response.json())
    },
  },
  {
    profile: 'application',
    runtime: 'Direct Fetch',
    scenario: 'query-header-read',
    async run() {
      const params = { organizationId: resourceValue.organizationId }
      const query = queryValue
      const headers = headerValue
      const search = new URLSearchParams({ cursor: query.cursor, limit: query.limit })
      for (const role of query.role) search.append('role', role)
      const response = await applicationHandler(
        new Request(`https://bench.local/organizations/${encodeURIComponent(params.organizationId)}/users?${search}`, {
          headers,
        })
      )
      assertCollection(await response.json())
    },
  },
  {
    profile: 'application',
    runtime: 'Direct Fetch',
    scenario: 'mixed-update',
    async run() {
      const query = updateQueryValue
      const headers = headerValue
      const body = updateBodyValue
      const response = await applicationHandler(
        new Request(`https://bench.local${resourcePath()}?notify=${query.notify}`, {
          method: 'PATCH',
          headers: { ...headers, 'content-type': 'application/json' },
          body: JSON.stringify(body),
        })
      )
      assertResource(await response.json())
    },
  },
]

export const directFetchNativeBenchmarks: readonly Benchmark[] = [
  {
    profile: 'native',
    runtime: 'Direct Fetch',
    scenario: 'static-get',
    async run() {
      assertHealth(await (await nativeHandler(new Request('https://bench.local/health'))).json())
    },
  },
  {
    profile: 'native',
    runtime: 'Direct Fetch',
    scenario: 'small-json-post',
    async run() {
      const response = await nativeHandler(
        new Request('https://bench.local/users', {
          method: 'POST',
          headers: { 'content-type': 'application/json' },
          body: JSON.stringify(createUserValue),
        })
      )
      assertCreatedUser(await response.json())
    },
  },
  {
    profile: 'native',
    runtime: 'Direct Fetch',
    scenario: 'large-json-post',
    async run() {
      const response = await nativeHandler(
        new Request('https://bench.local/large', {
          method: 'POST',
          headers: { 'content-type': 'application/json' },
          body: JSON.stringify(largeValue),
        })
      )
      assertLarge(await response.json())
    },
  },
]

export const directFetchBenchmarks: readonly Benchmark[] = [
  {
    runtime: 'Direct Fetch',
    scenario: 'static-get',
    async run() {
      assertHealth(await (await handler(new Request('https://bench.local/health'))).json())
    },
  },
  {
    runtime: 'Direct Fetch',
    scenario: 'small-json-post',
    async run() {
      const input = createUserValue
      const response = await handler(
        new Request('https://bench.local/users', {
          method: 'POST',
          headers: { 'content-type': 'application/json' },
          body: JSON.stringify(input),
        })
      )
      assertCreatedUser(await response.json())
    },
  },
  {
    runtime: 'Direct Fetch',
    scenario: 'large-json-post',
    async run() {
      const input = largeValue
      const response = await handler(
        new Request('https://bench.local/large', {
          method: 'POST',
          headers: { 'content-type': 'application/json' },
          body: JSON.stringify(input),
        })
      )
      assertLarge(await response.json())
    },
  },
]
