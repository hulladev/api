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
      const input = encodeValue(createUserInput, createUserValue)
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
      const input = encodeValue(largeInput, largeValue)
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
