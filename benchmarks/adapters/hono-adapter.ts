import { zValidator } from '@hono/zod-validator'
import { defineContract, response, route } from '@hulla/api'
import { honoAdapter } from '@hulla/api-hono'
import { defineServer } from '@hulla/api/server'
import { Hono } from 'hono'
import {
  adapterDynamicOutput,
  adapterRequest,
  adapterRestDynamicBody,
  adapterRestDynamicBodyJson,
  adapterRestDynamicParams,
  adapterRestDynamicQuery,
  adapterStaticOutput,
  adapterStaticValue,
  assertAdapterResponse,
} from '../fixtures/adapter-workload'
import type { Benchmark } from '../harness'
import {
  assertOrpcAdapterResponse,
  assertTrpcAdapterResponse,
  handleOrpcAdapterRequest,
  handleTrpcAdapterRequest,
  orpcAdapterRequest,
  trpcAdapterRequest,
} from './rpc'

const contract = defineContract({
  routes: {
    static: route.get('/adapter/static', { responses: { 200: response.json(adapterStaticOutput) } }),
    dynamic: route.post('/adapter/items/:id', {
      params: adapterRestDynamicParams,
      query: adapterRestDynamicQuery,
      body: adapterRestDynamicBody,
      responses: { 201: response.json(adapterDynamicOutput) },
    }),
  },
})

const hullaApp = new Hono()
honoAdapter(hullaApp).mount(
  defineServer(contract).implement({
    static: () => ({ status: 200, body: adapterStaticValue }),
    dynamic: ({ params, query, body }) => ({
      status: 201,
      body: { id: params.id, name: body.name, tag: query.tag },
    }),
  })
)

const nativeApp = new Hono()
  .get('/adapter/static', (context) => context.json(adapterStaticValue))
  .post(
    '/adapter/items/:id',
    zValidator('param', adapterRestDynamicParams),
    zValidator('query', adapterRestDynamicQuery),
    zValidator('json', adapterRestDynamicBody),
    (context) => {
      const params = context.req.valid('param')
      const query = context.req.valid('query')
      const body = context.req.valid('json')
      return context.json(adapterDynamicOutput.parse({ id: params.id, name: body.name, tag: query.tag }), 201)
    }
  )

const trpcApp = new Hono().all('/trpc/*', (context) => handleTrpcAdapterRequest(context.req.raw))
const orpcApp = new Hono().all('/rpc/*', (context) => handleOrpcAdapterRequest(context.req.raw))

function request(dynamic: boolean): Request {
  return adapterRequest(
    dynamic ? '/adapter/items/item-42?tag=bench' : '/adapter/static',
    dynamic ? adapterRestDynamicBodyJson : undefined
  )
}

async function directHono(dynamic: boolean): Promise<void> {
  await assertAdapterResponse(await nativeApp.fetch(request(dynamic)), dynamic)
}

async function hullaHono(dynamic: boolean): Promise<void> {
  await assertAdapterResponse(await hullaApp.fetch(request(dynamic)), dynamic)
}

async function trpcHono(dynamic: boolean): Promise<void> {
  await assertTrpcAdapterResponse(await trpcApp.fetch(trpcAdapterRequest(dynamic)), dynamic)
}

async function orpcHono(dynamic: boolean): Promise<void> {
  await assertOrpcAdapterResponse(await orpcApp.fetch(orpcAdapterRequest(dynamic)), dynamic)
}

export const honoAdapterBenchmarks: readonly Benchmark[] = (
  [
    { runtime: 'Direct Hono', scenario: 'hono-adapter-static-dispatch', run: () => directHono(false) },
    { runtime: '@hulla/api Hono', scenario: 'hono-adapter-static-dispatch', run: () => hullaHono(false) },
    { runtime: 'tRPC Hono', scenario: 'hono-adapter-static-dispatch', run: () => trpcHono(false) },
    { runtime: 'oRPC Hono', scenario: 'hono-adapter-static-dispatch', run: () => orpcHono(false) },
    { runtime: 'Direct Hono', scenario: 'hono-adapter-dynamic-dispatch', run: () => directHono(true) },
    { runtime: '@hulla/api Hono', scenario: 'hono-adapter-dynamic-dispatch', run: () => hullaHono(true) },
    { runtime: 'tRPC Hono', scenario: 'hono-adapter-dynamic-dispatch', run: () => trpcHono(true) },
    { runtime: 'oRPC Hono', scenario: 'hono-adapter-dynamic-dispatch', run: () => orpcHono(true) },
  ] satisfies readonly Benchmark[]
).map((benchmark) => ({ ...benchmark, profile: 'native' }))
