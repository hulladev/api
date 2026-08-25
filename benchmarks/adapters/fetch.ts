import { zValidator } from '@hono/zod-validator'
import { defineContract, response, route } from '@hulla/api'
import { createFetchHandler as createHullaFetchHandler } from '@hulla/api/fetch'
import { defineServer } from '@hulla/api/server'
import { os } from '@orpc/server'
import { RPCHandler } from '@orpc/server/fetch'
import { initTRPC } from '@trpc/server'
import { fetchRequestHandler as handleTrpcFetchRequest } from '@trpc/server/adapters/fetch'
import { initContract } from '@ts-rest/core'
import { createFetchHandler as createTsRestFetchHandler } from '@ts-rest/serverless/fetch'
import { Hono } from 'hono'
import { z } from 'zod'
import {
  adapterDynamicBody as dynamicBody,
  adapterDynamicInput as dynamicInput,
  adapterDynamicOutput as dynamicOutput,
  adapterDynamicValue as dynamicValue,
  adapterRequest as request,
  adapterRestDynamicBody as restDynamicBody,
  adapterRestDynamicBodyJson as restDynamicBodyJson,
  adapterRestDynamicParams as restDynamicParams,
  adapterRestDynamicQuery as restDynamicQuery,
  adapterStaticOutput as staticOutput,
  adapterStaticValue as staticValue,
  assertAdapterResponse as assertRestResponse,
} from '../fixtures/adapter-workload'
import type { Benchmark } from '../harness'

async function directFetch(dynamic: boolean): Promise<void> {
  const incoming = request(
    dynamic ? '/adapter/items/item-42?tag=bench' : '/adapter/static',
    dynamic ? restDynamicBodyJson : undefined
  )
  let result: Response
  if (dynamic) {
    const url = new URL(incoming.url)
    const params = restDynamicParams.parse({ id: url.pathname.split('/').at(-1) })
    const query = restDynamicQuery.parse(Object.fromEntries(url.searchParams))
    const body = restDynamicBody.parse(await incoming.json())
    result = Response.json(dynamicOutput.parse({ id: params.id, name: body.name, tag: query.tag }), { status: 201 })
  } else result = Response.json(staticOutput.parse(staticValue))
  await assertRestResponse(result, dynamic)
}

const hullaContract = defineContract({
  routes: {
    static: route.get('/adapter/static', { responses: { 200: response.json(staticOutput) } }),
    dynamic: route.post('/adapter/items/:id', {
      params: z.object({ id: z.string() }),
      query: z.object({ tag: z.string() }),
      body: z.object({ name: z.string() }),
      responses: { 201: response.json(dynamicOutput) },
    }),
  },
})
const hullaHandler = createHullaFetchHandler(
  defineServer(hullaContract).implement({
    static: () => ({ status: 200, body: staticValue }),
    dynamic: ({ params, query, body }) => ({
      status: 201,
      body: { id: params.id, name: body.name, tag: query.tag },
    }),
  })
)

async function hullaFetch(dynamic: boolean): Promise<void> {
  const result = await hullaHandler(
    request(dynamic ? '/adapter/items/item-42?tag=bench' : '/adapter/static', dynamic ? restDynamicBodyJson : undefined)
  )
  await assertRestResponse(result, dynamic)
}

const honoHandler = new Hono()
  .get('/adapter/static', (context) => context.json(staticValue))
  .post(
    '/adapter/items/:id',
    zValidator('param', restDynamicParams),
    zValidator('query', restDynamicQuery),
    zValidator('json', restDynamicBody),
    (context) => {
      const params = context.req.valid('param')
      const query = context.req.valid('query')
      const body = context.req.valid('json')
      return context.json(dynamicOutput.parse({ id: params.id, name: body.name, tag: query.tag }), 201)
    }
  )

async function honoFetch(dynamic: boolean): Promise<void> {
  const result = await honoHandler.fetch(
    request(dynamic ? '/adapter/items/item-42?tag=bench' : '/adapter/static', dynamic ? restDynamicBodyJson : undefined)
  )
  await assertRestResponse(result, dynamic)
}

const t = initTRPC.create()
const trpcRouter = t.router({
  static: t.procedure.output(staticOutput).query(() => staticValue),
  dynamic: t.procedure
    .input(dynamicInput)
    .output(dynamicOutput)
    .mutation(({ input }) => input),
})

async function trpcFetch(dynamic: boolean): Promise<void> {
  const result = await handleTrpcFetchRequest({
    endpoint: '/trpc',
    req: request(dynamic ? '/trpc/dynamic' : '/trpc/static', dynamic ? dynamicBody : undefined),
    router: trpcRouter,
  })
  if (result.status !== 200) throw new Error('Unexpected tRPC adapter status')
  const envelope = (await result.json()) as { readonly result?: { readonly data?: unknown } }
  if (dynamic) dynamicOutput.parse(envelope.result?.data)
  else if (!staticOutput.parse(envelope.result?.data).ok) throw new Error('Unexpected tRPC adapter result')
}

const orpcRouter = {
  static: os.output(staticOutput).handler(() => staticValue),
  dynamic: os
    .input(dynamicInput)
    .output(dynamicOutput)
    .handler(({ input }) => input),
}
const orpcHandler = new RPCHandler(orpcRouter)

async function orpcFetch(dynamic: boolean): Promise<void> {
  const body = dynamic ? JSON.stringify({ json: dynamicValue }) : '{}'
  const result = await orpcHandler.handle(request(dynamic ? '/rpc/dynamic' : '/rpc/static', body), {
    prefix: '/rpc',
    context: {},
  })
  if (!result.matched || result.response === undefined || result.response.status !== 200) {
    throw new Error('Unexpected oRPC adapter status')
  }
  const envelope = (await result.response.json()) as { readonly json?: unknown }
  if (dynamic) dynamicOutput.parse(envelope.json)
  else if (!staticOutput.parse(envelope.json).ok) throw new Error('Unexpected oRPC adapter result')
}

const tsContractBuilder = initContract()
const tsStaticOutput = z.object({ ok: z.boolean() })
const tsDynamicInput = z.object({ name: z.string() })
const tsDynamicOutput = z.object({ id: z.string(), name: z.string(), tag: z.string() })
const tsContract = tsContractBuilder.router({
  static: {
    method: 'GET',
    path: '/adapter/static',
    responses: { 200: tsStaticOutput },
  },
  dynamic: {
    method: 'POST',
    path: '/adapter/items/:id',
    pathParams: z.object({ id: z.string() }),
    query: z.object({ tag: z.string() }),
    body: tsDynamicInput,
    responses: { 201: tsDynamicOutput },
  },
})
const tsImplementations = {
  static: async () => ({ status: 200, body: staticValue }),
  dynamic: async (input: {
    readonly body: { readonly name: string }
    readonly params: { readonly id: string }
    readonly query: { readonly tag: string }
  }) => ({
    status: 201,
    body: { id: input.params.id, name: input.body.name, tag: input.query.tag },
  }),
}
// ts-rest 3's router types are bound to its Zod 3 peer while this benchmark workspace uses Zod 4.
// The handler is an identity wrapper at runtime; the schemas still perform native request and response validation.
const tsRestHandler = createTsRestFetchHandler(tsContract, tsImplementations as never, { responseValidation: true })

async function tsRestFetch(dynamic: boolean): Promise<void> {
  const result = await tsRestHandler(
    request(dynamic ? '/adapter/items/item-42?tag=bench' : '/adapter/static', dynamic ? restDynamicBodyJson : undefined)
  )
  await assertRestResponse(result, dynamic)
}

export const fetchAdapterBenchmarks: readonly Benchmark[] = (
  [
    { runtime: 'Direct Fetch', scenario: 'fetch-adapter-static-dispatch', run: () => directFetch(false) },
    { runtime: '@hulla/api Fetch', scenario: 'fetch-adapter-static-dispatch', run: () => hullaFetch(false) },
    { runtime: 'tRPC Fetch', scenario: 'fetch-adapter-static-dispatch', run: () => trpcFetch(false) },
    { runtime: 'oRPC Fetch', scenario: 'fetch-adapter-static-dispatch', run: () => orpcFetch(false) },
    { runtime: 'ts-rest Fetch', scenario: 'fetch-adapter-static-dispatch', run: () => tsRestFetch(false) },
    { runtime: 'Hono Fetch', scenario: 'fetch-adapter-static-dispatch', run: () => honoFetch(false) },
    { runtime: 'Direct Fetch', scenario: 'fetch-adapter-dynamic-dispatch', run: () => directFetch(true) },
    { runtime: '@hulla/api Fetch', scenario: 'fetch-adapter-dynamic-dispatch', run: () => hullaFetch(true) },
    { runtime: 'tRPC Fetch', scenario: 'fetch-adapter-dynamic-dispatch', run: () => trpcFetch(true) },
    { runtime: 'oRPC Fetch', scenario: 'fetch-adapter-dynamic-dispatch', run: () => orpcFetch(true) },
    { runtime: 'ts-rest Fetch', scenario: 'fetch-adapter-dynamic-dispatch', run: () => tsRestFetch(true) },
    { runtime: 'Hono Fetch', scenario: 'fetch-adapter-dynamic-dispatch', run: () => honoFetch(true) },
  ] satisfies readonly Benchmark[]
).map((benchmark) => ({ ...benchmark, profile: 'native' }))
