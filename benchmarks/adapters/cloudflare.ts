import { defineContract, response, route } from '@hulla/api'
import { cloudflareAdapter, createWorkerHandler, type CloudflareExecutionContext } from '@hulla/api-cloudflare'
import { defineServer } from '@hulla/api/server'
import {
  adapterDynamicOutput,
  adapterRequest,
  adapterRestDynamicBody,
  adapterRestDynamicBodyJson,
  adapterRestDynamicParams,
  adapterRestDynamicQuery,
  adapterStaticOutput,
  assertAdapterResponse,
  directAdapterHandler,
} from '../fixtures/adapter-workload'
import type { Benchmark } from '../harness'

type Env = {
  readonly enabled: boolean
}

const env: Env = { enabled: true }
const executionContext: CloudflareExecutionContext = {
  passThroughOnException() {},
  waitUntil() {},
}

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

const workerHandler = createWorkerHandler(
  defineServer(contract, {
    adapter: cloudflareAdapter<Env>(),
    context: ({ env }) => ({ enabled: env.enabled }),
  }).implement({
    static: ({ context }) => ({ status: 200, body: { ok: context.enabled } }),
    dynamic: ({ context, params, query, body }) => ({
      status: 201,
      body: { id: params.id, name: context.enabled ? body.name : '', tag: query.tag },
    }),
  })
)

function request(dynamic: boolean): Request {
  return adapterRequest(
    dynamic ? '/adapter/items/item-42?tag=bench' : '/adapter/static',
    dynamic ? adapterRestDynamicBodyJson : undefined
  )
}

async function directWorker(dynamic: boolean): Promise<void> {
  if (!env.enabled) throw new Error('Cloudflare benchmark binding is disabled')
  await assertAdapterResponse(await directAdapterHandler(request(dynamic)), dynamic)
}

async function hullaWorker(dynamic: boolean): Promise<void> {
  await assertAdapterResponse(await workerHandler(request(dynamic), env, executionContext), dynamic)
}

export const cloudflareAdapterBenchmarks: readonly Benchmark[] = (
  [
    {
      runtime: 'Direct Cloudflare Workers',
      scenario: 'cloudflare-adapter-static-dispatch',
      run: () => directWorker(false),
    },
    {
      runtime: '@hulla/api Cloudflare Workers',
      scenario: 'cloudflare-adapter-static-dispatch',
      run: () => hullaWorker(false),
    },
    {
      runtime: 'Direct Cloudflare Workers',
      scenario: 'cloudflare-adapter-dynamic-dispatch',
      run: () => directWorker(true),
    },
    {
      runtime: '@hulla/api Cloudflare Workers',
      scenario: 'cloudflare-adapter-dynamic-dispatch',
      run: () => hullaWorker(true),
    },
  ] satisfies readonly Benchmark[]
).map((benchmark) => ({ ...benchmark, profile: 'native' }))
