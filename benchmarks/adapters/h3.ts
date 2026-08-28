import { defineContract, response, route } from '@hulla/api'
import { h3Adapter } from '@hulla/api-h3'
import { defineServer } from '@hulla/api/server'
import { getRouterParams, H3 } from 'h3'
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

const hullaApp = new H3()
h3Adapter(hullaApp).mount(
  defineServer(contract).implement({
    static: () => ({ status: 200, body: adapterStaticValue }),
    dynamic: ({ params, query, body }) => ({
      status: 201,
      body: { id: params.id, name: body.name, tag: query.tag },
    }),
  })
)

const nativeApp = new H3()
  .get('/adapter/static', () => Response.json(adapterStaticOutput.parse(adapterStaticValue)))
  .post('/adapter/items/:id', async (event) => {
    const params = adapterRestDynamicParams.parse(getRouterParams(event, { decode: true }))
    const query = adapterRestDynamicQuery.parse(Object.fromEntries(event.url.searchParams))
    const body = adapterRestDynamicBody.parse(await event.req.json())
    return Response.json(adapterDynamicOutput.parse({ id: params.id, name: body.name, tag: query.tag }), {
      status: 201,
    })
  })

const trpcApp = new H3().all('/trpc/**', (event) => handleTrpcAdapterRequest(event.req))
const orpcApp = new H3().all('/rpc/**', (event) => handleOrpcAdapterRequest(event.req))

function request(dynamic: boolean): Request {
  return adapterRequest(
    dynamic ? '/adapter/items/item-42?tag=bench' : '/adapter/static',
    dynamic ? adapterRestDynamicBodyJson : undefined
  )
}

async function directH3(dynamic: boolean): Promise<void> {
  await assertAdapterResponse(await nativeApp.fetch(request(dynamic)), dynamic)
}

async function hullaH3(dynamic: boolean): Promise<void> {
  await assertAdapterResponse(await hullaApp.fetch(request(dynamic)), dynamic)
}

async function trpcH3(dynamic: boolean): Promise<void> {
  await assertTrpcAdapterResponse(await trpcApp.fetch(trpcAdapterRequest(dynamic)), dynamic)
}

async function orpcH3(dynamic: boolean): Promise<void> {
  await assertOrpcAdapterResponse(await orpcApp.fetch(orpcAdapterRequest(dynamic)), dynamic)
}

export const h3AdapterBenchmarks: readonly Benchmark[] = (
  [
    { runtime: 'Direct H3', scenario: 'h3-adapter-static-dispatch', run: () => directH3(false) },
    { runtime: '@hulla/api H3', scenario: 'h3-adapter-static-dispatch', run: () => hullaH3(false) },
    { runtime: 'tRPC H3', scenario: 'h3-adapter-static-dispatch', run: () => trpcH3(false) },
    { runtime: 'oRPC H3', scenario: 'h3-adapter-static-dispatch', run: () => orpcH3(false) },
    { runtime: 'Direct H3', scenario: 'h3-adapter-dynamic-dispatch', run: () => directH3(true) },
    { runtime: '@hulla/api H3', scenario: 'h3-adapter-dynamic-dispatch', run: () => hullaH3(true) },
    { runtime: 'tRPC H3', scenario: 'h3-adapter-dynamic-dispatch', run: () => trpcH3(true) },
    { runtime: 'oRPC H3', scenario: 'h3-adapter-dynamic-dispatch', run: () => orpcH3(true) },
  ] satisfies readonly Benchmark[]
).map((benchmark) => ({ ...benchmark, profile: 'native' }))
