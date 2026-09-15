import { zValidator } from '@hono/zod-validator'
import { defineContract, response, route } from '@hulla/api'
import { cloudflareAdapter, type CloudflareExecutionContext } from '@hulla/api-cloudflare'
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
  directAdapterHandler,
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

type Env = {
  readonly enabled: boolean
}

const env: Env = { enabled: true }
const executionContext: CloudflareExecutionContext & { props: Record<string, unknown> } = {
  props: {},
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

const cloudflare = cloudflareAdapter<Env>()
const workerHandler = cloudflare.mount(
  defineServer(contract, {
    context: cloudflare.context(({ env }) => ({ enabled: env.enabled })),
  }).implement({
    static: ({ context }) => ({ status: 200, body: { ok: context.enabled } }),
    dynamic: ({ context, params, query, body }) => ({
      status: 201,
      body: { id: params.id, name: context.enabled ? body.name : '', tag: query.tag },
    }),
  })
)

const honoApp = new Hono()
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

async function trpcWorker(dynamic: boolean): Promise<void> {
  await assertTrpcAdapterResponse(await handleTrpcAdapterRequest(trpcAdapterRequest(dynamic)), dynamic)
}

async function orpcWorker(dynamic: boolean): Promise<void> {
  await assertOrpcAdapterResponse(await handleOrpcAdapterRequest(orpcAdapterRequest(dynamic)), dynamic)
}

async function honoWorker(dynamic: boolean): Promise<void> {
  await assertAdapterResponse(await honoApp.fetch(request(dynamic), env, executionContext), dynamic)
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
      runtime: 'tRPC Cloudflare Workers',
      scenario: 'cloudflare-adapter-static-dispatch',
      run: () => trpcWorker(false),
    },
    {
      runtime: 'oRPC Cloudflare Workers',
      scenario: 'cloudflare-adapter-static-dispatch',
      run: () => orpcWorker(false),
    },
    {
      runtime: 'Hono Cloudflare Workers',
      scenario: 'cloudflare-adapter-static-dispatch',
      run: () => honoWorker(false),
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
    {
      runtime: 'tRPC Cloudflare Workers',
      scenario: 'cloudflare-adapter-dynamic-dispatch',
      run: () => trpcWorker(true),
    },
    {
      runtime: 'oRPC Cloudflare Workers',
      scenario: 'cloudflare-adapter-dynamic-dispatch',
      run: () => orpcWorker(true),
    },
    {
      runtime: 'Hono Cloudflare Workers',
      scenario: 'cloudflare-adapter-dynamic-dispatch',
      run: () => honoWorker(true),
    },
  ] satisfies readonly Benchmark[]
).map((benchmark) => ({ ...benchmark, profile: 'native' }))
