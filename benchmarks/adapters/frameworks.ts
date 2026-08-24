import { zValidator } from '@hono/zod-validator'
import { defineContract, response, route } from '@hulla/api'
import { createRouteHandler } from '@hulla/api-next/server'
import { createServerRouteHandlers } from '@hulla/api-tanstack-start/server'
import { defineServer } from '@hulla/api/server'
import { os } from '@orpc/server'
import { RPCHandler } from '@orpc/server/fetch'
import { initTRPC } from '@trpc/server'
import { fetchRequestHandler as handleTrpcFetchRequest } from '@trpc/server/adapters/fetch'
import { initContract } from '@ts-rest/core'
import { createNextHandler as createTsRestNextHandler } from '@ts-rest/serverless/next'
import { Hono } from 'hono'
import { handle as createHonoNextHandler } from 'hono/vercel'
import { NextRequest } from 'next/server'
import {
  adapterDynamicBody,
  adapterDynamicInput,
  adapterDynamicOutput,
  adapterDynamicValue,
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

const implementation = defineServer(contract).implement({
  static: () => ({ status: 200, body: adapterStaticValue }),
  dynamic: ({ params, query, body }) => ({
    status: 201,
    body: { id: params.id, name: body.name, tag: query.tag },
  }),
})

function restRequest(dynamic: boolean, next: boolean): Request {
  const path = dynamic ? '/adapter/items/item-42?tag=bench' : '/adapter/static'
  const body = dynamic ? adapterRestDynamicBodyJson : undefined
  const incoming = adapterRequest(path, body)
  return next ? new NextRequest(incoming) : incoming
}

const nextHandler = createRouteHandler(implementation)
const nextRouteContext = { params: Promise.resolve({ hulla: ['adapter'] }) }

async function directNext(dynamic: boolean): Promise<void> {
  await assertAdapterResponse(await directAdapterHandler(restRequest(dynamic, true)), dynamic)
}

async function hullaNext(dynamic: boolean): Promise<void> {
  await assertAdapterResponse(await nextHandler(restRequest(dynamic, true) as NextRequest, nextRouteContext), dynamic)
}

const tsContractBuilder = initContract()
const tsContract = tsContractBuilder.router({
  static: {
    method: 'GET',
    path: '/adapter/static',
    responses: { 200: adapterStaticOutput },
  },
  dynamic: {
    method: 'POST',
    path: '/adapter/items/:id',
    pathParams: adapterRestDynamicParams,
    query: adapterRestDynamicQuery,
    body: adapterRestDynamicBody,
    responses: { 201: adapterDynamicOutput },
  },
})
const tsImplementations = {
  static: async () => ({ status: 200, body: adapterStaticValue }),
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
const tsRestNextHandler = createTsRestNextHandler(tsContract, tsImplementations as never, {
  handlerType: 'app-router',
  responseValidation: true,
})

async function tsRestNext(dynamic: boolean): Promise<void> {
  await assertAdapterResponse(await tsRestNextHandler(restRequest(dynamic, true) as NextRequest), dynamic)
}

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
const honoNextHandler = createHonoNextHandler(honoApp)

async function honoNext(dynamic: boolean): Promise<void> {
  await assertAdapterResponse(await honoNextHandler(restRequest(dynamic, true)), dynamic)
}

const t = initTRPC.create()
const trpcRouter = t.router({
  static: t.procedure.output(adapterStaticOutput).query(() => adapterStaticValue),
  dynamic: t.procedure
    .input(adapterDynamicInput)
    .output(adapterDynamicOutput)
    .mutation(({ input }) => input),
})

async function trpcHandler(request: Request, dynamic: boolean): Promise<void> {
  const result = await handleTrpcFetchRequest({ endpoint: '/trpc', req: request, router: trpcRouter })
  if (result.status !== 200) throw new Error('Unexpected tRPC adapter status')
  const envelope = (await result.json()) as { readonly result?: { readonly data?: unknown } }
  if (dynamic) adapterDynamicOutput.parse(envelope.result?.data)
  else if (!adapterStaticOutput.parse(envelope.result?.data).ok) throw new Error('Unexpected tRPC adapter result')
}

function trpcRequest(dynamic: boolean, next: boolean): Request {
  const incoming = adapterRequest(dynamic ? '/trpc/dynamic' : '/trpc/static', dynamic ? adapterDynamicBody : undefined)
  return next ? new NextRequest(incoming) : incoming
}

async function trpcNext(dynamic: boolean): Promise<void> {
  await trpcHandler(trpcRequest(dynamic, true), dynamic)
}

const orpcRouter = {
  static: os.output(adapterStaticOutput).handler(() => adapterStaticValue),
  dynamic: os
    .input(adapterDynamicInput)
    .output(adapterDynamicOutput)
    .handler(({ input }) => input),
}
const orpcHandler = new RPCHandler(orpcRouter)

async function runOrpcHandler(request: Request, dynamic: boolean): Promise<void> {
  const result = await orpcHandler.handle(request, { prefix: '/rpc', context: {} })
  if (!result.matched || result.response === undefined || result.response.status !== 200) {
    throw new Error('Unexpected oRPC adapter status')
  }
  const envelope = (await result.response.json()) as { readonly json?: unknown }
  if (dynamic) adapterDynamicOutput.parse(envelope.json)
  else if (!adapterStaticOutput.parse(envelope.json).ok) throw new Error('Unexpected oRPC adapter result')
}

function orpcRequest(dynamic: boolean, next: boolean): Request {
  const incoming = adapterRequest(
    dynamic ? '/rpc/dynamic' : '/rpc/static',
    dynamic ? JSON.stringify({ json: adapterDynamicValue }) : '{}'
  )
  return next ? new NextRequest(incoming) : incoming
}

async function orpcNext(dynamic: boolean): Promise<void> {
  await runOrpcHandler(orpcRequest(dynamic, true), dynamic)
}

const startHandlers = createServerRouteHandlers(implementation)

type StartInput = {
  readonly context: Record<string, never>
  readonly params: { readonly _splat: string }
  readonly request: Request
}

function startInput(incoming: Request): StartInput {
  return {
    context: {},
    params: { _splat: new URL(incoming.url).pathname.slice(1) },
    request: incoming,
  }
}

async function directStart(dynamic: boolean): Promise<void> {
  await assertAdapterResponse(await directAdapterHandler(startInput(restRequest(dynamic, false)).request), dynamic)
}

async function hullaStart(dynamic: boolean): Promise<void> {
  const input = startInput(restRequest(dynamic, false))
  const responseValue = dynamic ? await startHandlers.POST!(input) : await startHandlers.GET!(input)
  await assertAdapterResponse(responseValue, dynamic)
}

async function trpcStart(dynamic: boolean): Promise<void> {
  await trpcHandler(startInput(trpcRequest(dynamic, false)).request, dynamic)
}

async function orpcStart(dynamic: boolean): Promise<void> {
  await runOrpcHandler(startInput(orpcRequest(dynamic, false)).request, dynamic)
}

export const frameworkAdapterBenchmarks: readonly Benchmark[] = (
  [
    { runtime: 'Direct Next.js', scenario: 'next-adapter-static-dispatch', run: () => directNext(false) },
    { runtime: '@hulla/api Next.js', scenario: 'next-adapter-static-dispatch', run: () => hullaNext(false) },
    { runtime: 'ts-rest Next.js', scenario: 'next-adapter-static-dispatch', run: () => tsRestNext(false) },
    { runtime: 'tRPC Next.js', scenario: 'next-adapter-static-dispatch', run: () => trpcNext(false) },
    { runtime: 'oRPC Next.js', scenario: 'next-adapter-static-dispatch', run: () => orpcNext(false) },
    { runtime: 'Hono Next.js', scenario: 'next-adapter-static-dispatch', run: () => honoNext(false) },
    { runtime: 'Direct Next.js', scenario: 'next-adapter-dynamic-dispatch', run: () => directNext(true) },
    { runtime: '@hulla/api Next.js', scenario: 'next-adapter-dynamic-dispatch', run: () => hullaNext(true) },
    { runtime: 'ts-rest Next.js', scenario: 'next-adapter-dynamic-dispatch', run: () => tsRestNext(true) },
    { runtime: 'tRPC Next.js', scenario: 'next-adapter-dynamic-dispatch', run: () => trpcNext(true) },
    { runtime: 'oRPC Next.js', scenario: 'next-adapter-dynamic-dispatch', run: () => orpcNext(true) },
    { runtime: 'Hono Next.js', scenario: 'next-adapter-dynamic-dispatch', run: () => honoNext(true) },
    {
      runtime: 'Direct TanStack Start',
      scenario: 'tanstack-start-adapter-static-dispatch',
      run: () => directStart(false),
    },
    {
      runtime: '@hulla/api TanStack Start',
      scenario: 'tanstack-start-adapter-static-dispatch',
      run: () => hullaStart(false),
    },
    {
      runtime: 'tRPC TanStack Start',
      scenario: 'tanstack-start-adapter-static-dispatch',
      run: () => trpcStart(false),
    },
    {
      runtime: 'oRPC TanStack Start',
      scenario: 'tanstack-start-adapter-static-dispatch',
      run: () => orpcStart(false),
    },
    {
      runtime: 'Direct TanStack Start',
      scenario: 'tanstack-start-adapter-dynamic-dispatch',
      run: () => directStart(true),
    },
    {
      runtime: '@hulla/api TanStack Start',
      scenario: 'tanstack-start-adapter-dynamic-dispatch',
      run: () => hullaStart(true),
    },
    {
      runtime: 'tRPC TanStack Start',
      scenario: 'tanstack-start-adapter-dynamic-dispatch',
      run: () => trpcStart(true),
    },
    {
      runtime: 'oRPC TanStack Start',
      scenario: 'tanstack-start-adapter-dynamic-dispatch',
      run: () => orpcStart(true),
    },
  ] satisfies readonly Benchmark[]
).map((benchmark) => ({ ...benchmark, profile: 'native' }))
