import { defineContract, response, route } from '@hulla/api'
import { defineClient } from '@hulla/api/client'
import { fetchAdapter, fetchTransport } from '@hulla/api/fetch'
import { defineServer } from '@hulla/api/server'
import { createORPCClient } from '@orpc/client'
import { RPCLink } from '@orpc/client/fetch'
import { os, type RouterClient } from '@orpc/server'
import { RPCHandler } from '@orpc/server/fetch'
import { createTRPCClient, httpLink } from '@trpc/client'
import { initTRPC } from '@trpc/server'
import { fetchRequestHandler } from '@trpc/server/adapters/fetch'
import { initClient, initContract, type ApiFetcher, type AppRouteQuery } from '@ts-rest/core'
import { createFetchHandler as createTsRestHandler, tsr } from '@ts-rest/serverless/fetch'
import { Hono } from 'hono'
import { hc } from 'hono/client'
import type { z } from 'zod'
import { assertHealth, encodeValue, healthOutput, healthValue } from './fixtures/scenario'
import type { Benchmark } from './harness'

type HealthOutput = z.infer<typeof healthOutput>

async function directFirstCall(): Promise<void> {
  const handler = async () => Response.json(encodeValue(healthOutput, healthValue))
  assertHealth(await (await handler()).json())
}

async function hullaApiFirstCall(): Promise<void> {
  const contract = defineContract({
    routes: { health: route.get('/health', { responses: { 200: response.json(healthOutput) } }) },
  })
  const server = defineServer(contract)
  const handler = fetchAdapter().mount(server.implement({ health: () => ({ status: 200, body: healthValue }) }))
  const client = defineClient(contract, {
    transport: fetchTransport({ baseUrl: 'https://bench.local', fetch: handler }),
  }).create()
  const result = await client.health()
  if (result.status !== 200 || !result.body.ok) throw new Error('Unexpected cold @hulla/api result')
}

async function trpcFirstCall(): Promise<void> {
  const t = initTRPC.create()
  const router = t.router({ health: t.procedure.query(() => encodeValue(healthOutput, healthValue)) })
  const client = createTRPCClient<typeof router>({
    links: [
      httpLink({
        url: 'https://bench.local/trpc',
        fetch: (input, init) =>
          fetchRequestHandler({
            endpoint: '/trpc',
            req: new Request(input, init as RequestInit | undefined),
            router,
          }),
      }),
    ],
  })
  assertHealth(await client.health.query())
}

async function orpcFirstCall(): Promise<void> {
  const router = { health: os.handler(() => encodeValue(healthOutput, healthValue)) }
  const handler = new RPCHandler(router)
  const link = new RPCLink({
    url: 'https://bench.local/rpc',
    fetch: async (request, init) => {
      const result = await handler.handle(new Request(request, init), { prefix: '/rpc', context: {} })
      return result.matched ? result.response : new Response(null, { status: 404 })
    },
  })
  const client: RouterClient<typeof router> = createORPCClient(link)
  assertHealth(await client.health())
}

async function tsRestFirstCall(): Promise<void> {
  const c = initContract()
  const health: AppRouteQuery = {
    method: 'GET',
    path: '/health',
    responses: { 200: c.type<HealthOutput>() },
  }
  const contract: { readonly health: AppRouteQuery } = { health }
  const router = tsr.router(contract, {
    health: async () => ({ status: 200, body: encodeValue(healthOutput, healthValue) }),
  })
  const handler = createTsRestHandler(contract, router)
  const api: ApiFetcher = async ({ path, method, headers, validateResponse }) => {
    const responseValue = await handler(new Request(path, { method, headers }))
    const body: unknown = await responseValue.json()
    return {
      status: responseValue.status,
      headers: responseValue.headers,
      body: validateResponse ? healthOutput.parse(body) : body,
    }
  }
  const client = initClient(contract, { baseUrl: 'https://bench.local', api, validateResponse: true })
  const result = await client.health({ query: undefined })
  if (result.status !== 200 || !(result.body as HealthOutput).ok) throw new Error('Unexpected cold ts-rest result')
}

async function honoFirstCall(): Promise<void> {
  const app = new Hono().get('/health', (context) => context.json(encodeValue(healthOutput, healthValue)))
  const inMemoryFetch: typeof globalThis.fetch = async (input, init) => app.fetch(new Request(input, init))
  const client = hc<typeof app>('https://bench.local', {
    fetch: inMemoryFetch,
  })
  assertHealth(await (await client.health.$get()).json())
}

export const coldStartBenchmarks: readonly Benchmark[] = [
  { runtime: 'Direct Fetch', scenario: 'cold-first-call', run: directFirstCall },
  { runtime: '@hulla/api', scenario: 'cold-first-call', run: hullaApiFirstCall },
  { runtime: 'tRPC', scenario: 'cold-first-call', run: trpcFirstCall },
  { runtime: 'oRPC', scenario: 'cold-first-call', run: orpcFirstCall },
  { runtime: 'ts-rest', scenario: 'cold-first-call', run: tsRestFirstCall },
  { runtime: 'Hono RPC', scenario: 'cold-first-call', run: honoFirstCall },
]
