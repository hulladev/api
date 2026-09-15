import { defineContract, response, route } from '@hulla/api'
import { fastifyAdapter } from '@hulla/api-fastify'
import { defineServer } from '@hulla/api/server'
import { RPCHandler as OrpcFastifyHandler } from '@orpc/server/fastify'
import { fastifyTRPCPlugin } from '@trpc/server/adapters/fastify'
import Fastify, { type LightMyRequestResponse } from 'fastify'
import {
  adapterDynamicOutput,
  adapterRestDynamicBody,
  adapterRestDynamicParams,
  adapterRestDynamicQuery,
  adapterStaticOutput,
  adapterStaticValue,
} from '../fixtures/adapter-workload'
import type { Benchmark } from '../harness'
import { assertOrpcAdapterResponse, assertTrpcAdapterResponse, orpcRouter, trpcRouter } from './rpc'

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

const hullaApp = Fastify()
fastifyAdapter(hullaApp).mount(
  defineServer(contract).implement({
    static: () => ({ status: 200, body: adapterStaticValue }),
    dynamic: ({ params, query, body }) => ({
      status: 201,
      body: { id: params.id, name: body.name, tag: query.tag },
    }),
  })
)

const nativeApp = Fastify()
nativeApp.get('/adapter/static', () => adapterStaticOutput.parse(adapterStaticValue))
nativeApp.post('/adapter/items/:id', (request, reply) => {
  const params = adapterRestDynamicParams.parse(request.params)
  const query = adapterRestDynamicQuery.parse(request.query)
  const body = adapterRestDynamicBody.parse(request.body)
  return reply.code(201).send(adapterDynamicOutput.parse({ id: params.id, name: body.name, tag: query.tag }))
})

const trpcApp = Fastify()
trpcApp.register(fastifyTRPCPlugin, { prefix: '/trpc', trpcOptions: { router: trpcRouter } })

const orpcHandler = new OrpcFastifyHandler(orpcRouter)
const orpcApp = Fastify()
orpcApp.all('/rpc/*', async (requestValue, reply) => {
  const result = await orpcHandler.handle(requestValue, reply, { prefix: '/rpc', context: {} })
  if (!result.matched) await reply.callNotFound()
})

function request(dynamic: boolean) {
  return dynamic
    ? {
        method: 'POST' as const,
        url: '/adapter/items/item-42?tag=bench',
        headers: { 'content-type': 'application/json' },
        payload: { name: 'Ada' },
      }
    : { method: 'GET' as const, url: '/adapter/static' }
}

function assertReply(result: LightMyRequestResponse, dynamic: boolean): void {
  const status = dynamic ? 201 : 200
  if (result.statusCode !== status) throw new Error(`Unexpected Fastify adapter status ${result.statusCode}`)
  if (dynamic) adapterDynamicOutput.parse(result.json())
  else adapterStaticOutput.parse(result.json())
}

async function directFastify(dynamic: boolean): Promise<void> {
  assertReply(await nativeApp.inject(request(dynamic)), dynamic)
}

async function hullaFastify(dynamic: boolean): Promise<void> {
  assertReply(await hullaApp.inject(request(dynamic)), dynamic)
}

function rpcResponse(result: LightMyRequestResponse): Response {
  return new Response(result.body, { status: result.statusCode, headers: result.headers as HeadersInit })
}

async function trpcFastify(dynamic: boolean): Promise<void> {
  const result = await trpcApp.inject(
    dynamic
      ? { method: 'POST', url: '/trpc/dynamic', payload: { id: 'item-42', name: 'Ada', tag: 'bench' } }
      : { method: 'GET', url: '/trpc/static' }
  )
  await assertTrpcAdapterResponse(rpcResponse(result), dynamic)
}

async function orpcFastify(dynamic: boolean): Promise<void> {
  const result = await orpcApp.inject({
    method: 'POST',
    url: dynamic ? '/rpc/dynamic' : '/rpc/static',
    payload: dynamic ? { json: { id: 'item-42', name: 'Ada', tag: 'bench' } } : {},
  })
  await assertOrpcAdapterResponse(rpcResponse(result), dynamic)
}

export const fastifyAdapterBenchmarks: readonly Benchmark[] = (
  [
    { runtime: 'Direct Fastify', scenario: 'fastify-adapter-static-dispatch', run: () => directFastify(false) },
    { runtime: '@hulla/api Fastify', scenario: 'fastify-adapter-static-dispatch', run: () => hullaFastify(false) },
    { runtime: 'tRPC Fastify', scenario: 'fastify-adapter-static-dispatch', run: () => trpcFastify(false) },
    { runtime: 'oRPC Fastify', scenario: 'fastify-adapter-static-dispatch', run: () => orpcFastify(false) },
    { runtime: 'Direct Fastify', scenario: 'fastify-adapter-dynamic-dispatch', run: () => directFastify(true) },
    { runtime: '@hulla/api Fastify', scenario: 'fastify-adapter-dynamic-dispatch', run: () => hullaFastify(true) },
    { runtime: 'tRPC Fastify', scenario: 'fastify-adapter-dynamic-dispatch', run: () => trpcFastify(true) },
    { runtime: 'oRPC Fastify', scenario: 'fastify-adapter-dynamic-dispatch', run: () => orpcFastify(true) },
  ] satisfies readonly Benchmark[]
).map((benchmark) => ({ ...benchmark, profile: 'native' }))
