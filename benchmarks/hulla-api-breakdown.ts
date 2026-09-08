import { codec, defineContract, response, route } from '@hulla/api'
import { createAdapterHandler } from '@hulla/api/adapters'
import { defineClient } from '@hulla/api/client'
import { fetchAdapter, fetchTransport } from '@hulla/api/fetch'
import { inProcessTransport } from '@hulla/api/in-process'
import { defineServer } from '@hulla/api/server'
import { ndjson } from '@hulla/api/stream'
import { z } from 'zod'
import { encodeValue } from './fixtures/scenario'
import type { Benchmark } from './harness'

const parameterSchema = z.object({ id: z.string() })
const querySchema = z.object({ limit: z.string().regex(/^\d+$/) })
const headerSchema = z.object({ 'x-token': z.string().min(1) })
const transportOutput = z.object({ id: z.string(), limit: z.string(), token: z.string() })
const transportValue = { id: 'item/42', limit: '10', token: 'secret' }
const fetchHost = fetchAdapter()

const transportContract = defineContract({
  routes: {
    item: route.get('/items/:id', {
      params: parameterSchema,
      query: querySchema,
      headers: headerSchema,
      responses: { 200: response.json(transportOutput) },
    }),
  },
})
const transportServer = defineServer(transportContract)
const transportImplementation = transportServer.implement({
  item: (input) => ({
    status: 200,
    body: { id: input.params.id, limit: input.query.limit, token: input.headers['x-token'] },
  }),
})
const transportHandler = fetchHost.mount(transportImplementation)
const transportClient = defineClient(transportContract, {
  transport: fetchTransport({ baseUrl: 'https://bench.local', fetch: transportHandler }),
})

async function directTransport(): Promise<void> {
  const params = parameterSchema.parse({ id: transportValue.id })
  const query = querySchema.parse({ limit: transportValue.limit })
  const headers = headerSchema.parse({ 'x-token': transportValue.token })
  const request = new Request(
    `https://bench.local/items/${encodeURIComponent(params.id)}?limit=${encodeURIComponent(query.limit)}`,
    { headers }
  )
  const url = new URL(request.url)
  const serverParams = parameterSchema.parse({ id: decodeURIComponent(url.pathname.slice('/items/'.length)) })
  const serverQuery = querySchema.parse({ limit: url.searchParams.get('limit') })
  const serverHeaders = headerSchema.parse(Object.fromEntries(request.headers.entries()))
  const responseValue = encodeValue(transportOutput, {
    id: serverParams.id,
    limit: serverQuery.limit,
    token: serverHeaders['x-token'],
  })
  const responseValueResult = Response.json(responseValue)
  transportOutput.parse(await responseValueResult.json())
}

const middlewareOutput = z.literal('ok')
const middlewareContract = defineContract({
  routes: { protected: route.get('/protected', { responses: { 200: response.text(middlewareOutput) } }) },
})
const middlewareAdapter = fetchAdapter()
const middlewareServerBase = defineServer(middlewareContract, {
  context: middlewareAdapter.context(({ request }) => ({ token: request.headers.get('authorization') ?? '' })),
})
const serverMiddleware = middlewareServerBase.middleware(({ context, next }) => {
  if (context.token !== 'Bearer benchmark') throw new Error('Missing benchmark token')
  return next()
})
const middlewareServer = middlewareServerBase.use(serverMiddleware)
const middlewareHandler = middlewareAdapter.mount(
  middlewareServer.implement({ protected: ({ response }) => response(200, 'ok') })
)
const middlewareClientBase = defineClient(middlewareContract, {
  transport: fetchTransport({ baseUrl: 'https://bench.local', fetch: middlewareHandler }),
  headers: { authorization: 'Bearer benchmark' },
  context: ({ request }) => ({ method: request.method }),
})
const clientMiddleware = middlewareClientBase.middleware(({ context, next }) => {
  if (context.method !== 'GET') throw new Error('Unexpected method')
  return next()
})
const middlewareClient = middlewareClientBase.use(clientMiddleware)

async function directMiddleware(): Promise<void> {
  const request = new Request('https://bench.local/protected', {
    headers: { authorization: 'Bearer benchmark' },
  })
  const clientContext = { method: request.method }
  if (clientContext.method !== 'GET') throw new Error('Unexpected method')
  const serverContext = { token: request.headers.get('authorization') ?? '' }
  if (serverContext.token !== 'Bearer benchmark') throw new Error('Missing benchmark token')
  const responseValue = new Response(encodeValue(middlewareOutput, 'ok'))
  middlewareOutput.parse(await responseValue.text())
}

const failureInput = z.object({ count: z.number().int().positive() })
const failureContract = defineContract({
  routes: {
    failure: route.post('/failure', {
      body: failureInput,
      responses: { 204: response.empty() },
    }),
  },
})
const failureServer = defineServer(failureContract)
const failureHandler = fetchHost.mount(failureServer.implement({ failure: () => ({ status: 204 }) }))
const invalidBody = JSON.stringify({ count: -1 })

async function directFailure(): Promise<void> {
  const request = new Request('https://bench.local/failure', {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: invalidBody,
  })
  let responseValue: Response
  try {
    failureInput.parse(await request.json())
    responseValue = new Response(null, { status: 204 })
  } catch (error) {
    if (!(error instanceof z.ZodError)) throw error
    const problem = {
      type: 'about:blank',
      title: 'Invalid request',
      status: 400,
      code: 'schema-validation',
      issues: error.issues.map((issue) => ({ ...issue, location: 'body' as const })),
    }
    responseValue = new Response(JSON.stringify(problem), {
      status: 400,
      headers: { 'content-type': 'application/problem+json; charset=utf-8' },
    })
  }
  if (responseValue.status !== 400) throw new Error('Expected validation failure')
}

const adapterInput = z.object({ value: z.number().int() })
const adapterOutput = z.object({ doubled: z.number().int() })
const adapterValue = { value: 21 }
const adapterContract = defineContract({
  routes: {
    execute: route.post('/execute', {
      body: adapterInput,
      responses: { 200: response.json(adapterOutput) },
    }),
  },
})
const adapterServer = defineServer(adapterContract)
const adapterImplementation = adapterServer.implement({
  execute: (input) => ({ status: 200, body: { doubled: input.body.value * 2 } }),
})
const adapterFetch = fetchHost.mount(adapterImplementation)
const adapterWire = createAdapterHandler(adapterImplementation)
const adapterRequest = new Request('https://bench.local/execute', { method: 'POST' })

async function directWireDispatch(): Promise<void> {
  const input = adapterInput.parse(adapterValue)
  const responseValue = {
    status: 200,
    headers: { 'content-type': 'application/json' },
    body: { kind: 'json', value: encodeValue(adapterOutput, { doubled: input.value * 2 }) },
  } as const
  const output = adapterOutput.parse(responseValue.body.value)
  if (output.doubled !== 42) throw new Error('Unexpected direct adapter result')
}

async function hullaApiFetchDispatch(): Promise<void> {
  const responseValue = await adapterFetch(
    new Request('https://bench.local/execute', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify(adapterValue),
    })
  )
  const output = adapterOutput.parse(await responseValue.json())
  if (output.doubled !== 42) throw new Error('Unexpected Fetch adapter result')
}

async function hullaApiWireDispatch(): Promise<void> {
  const responseValue = await adapterWire({
    request: adapterRequest,
    method: 'POST',
    pathname: '/execute',
    headers: { 'content-type': 'application/json' },
    body: { value: adapterValue, contentType: 'application/json' },
  })
  if (responseValue.body.kind !== 'json') throw new Error('Unexpected adapter response representation')
  const output = adapterOutput.parse(responseValue.body.value)
  if (output.doubled !== 42) throw new Error('Unexpected adapter result')
}

const nativeDateCodec = z.object({
  createdAt: z.codec(z.iso.datetime(), z.date(), {
    decode: (value) => new Date(value),
    encode: (value) => value.toISOString(),
  }),
})
const dateCodec = codec(z.object({ createdAt: z.iso.datetime() }), z.object({ createdAt: z.date() }), {
  decode: ({ createdAt }) => ({ createdAt: new Date(createdAt) }),
  encode: ({ createdAt }) => ({ createdAt: createdAt.toISOString() }),
})
const codecValue = { createdAt: new Date('2026-08-16T12:00:00.000Z') }
const codecContract = defineContract({
  routes: {
    echo: route.post('/codec', {
      body: dateCodec,
      responses: { 200: response.json(dateCodec) },
    }),
  },
})
const codecServer = defineServer(codecContract)
const codecImplementation = codecServer.implement({ echo: (input) => ({ status: 200, body: input.body }) })
const codecHandler = fetchHost.mount(codecImplementation)
const codecClient = defineClient(codecContract, {
  transport: fetchTransport({ baseUrl: 'https://bench.local', fetch: codecHandler }),
})

async function directCodecRoundtrip(): Promise<void> {
  const clientWire = z.encode(nativeDateCodec, codecValue)
  const request = new Request('https://bench.local/codec', {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify(clientWire),
  })
  const serverValue = z.decode(nativeDateCodec, await request.json())
  const serverWire = z.encode(nativeDateCodec, serverValue)
  const responseValue = Response.json(serverWire)
  const clientValue = z.decode(nativeDateCodec, await responseValue.json())
  if (clientValue.createdAt.getTime() !== codecValue.createdAt.getTime()) throw new Error('Unexpected codec result')
}

async function hullaApiCodecRoundtrip(): Promise<void> {
  const result = await codecClient.echo({ body: codecValue })
  if (result.status !== 200 || result.body.createdAt.getTime() !== codecValue.createdAt.getTime()) {
    throw new Error('Unexpected codec result')
  }
}

const chunkSchema = z.object({ sequence: z.number().int() })
const chunks = Array.from({ length: 10 }, (_, sequence) => ({ sequence }))
const streamContract = defineContract({
  routes: { events: route.get('/events', { responses: { 200: response.stream(ndjson(chunkSchema)) } }) },
})
const streamServer = defineServer(streamContract)
const streamImplementation = streamServer.implement({ events: () => ({ status: 200, body: chunks }) })
const streamHandler = fetchHost.mount(streamImplementation)
const streamClient = defineClient(streamContract, {
  transport: fetchTransport({ baseUrl: 'https://bench.local', fetch: streamHandler }),
})

async function directStream(): Promise<void> {
  const encoder = new TextEncoder()
  let sequence = 0
  const body = new ReadableStream<Uint8Array>({
    pull(controller) {
      const chunk = chunks[sequence++]
      if (chunk === undefined) return controller.close()
      controller.enqueue(encoder.encode(`${JSON.stringify(encodeValue(chunkSchema, chunk))}\n`))
    },
  })
  const responseValue = new Response(body, { headers: { 'content-type': 'application/x-ndjson' } })
  const reader = responseValue.body!.getReader()
  const decoder = new TextDecoder()
  let buffered = ''
  let count = 0
  while (true) {
    const result = await reader.read()
    if (result.done) break
    buffered += decoder.decode(result.value, { stream: true })
    let newline = buffered.indexOf('\n')
    while (newline !== -1) {
      const value = chunkSchema.parse(JSON.parse(buffered.slice(0, newline)))
      if (value.sequence !== count) throw new Error('Unexpected stream value')
      count += 1
      buffered = buffered.slice(newline + 1)
      newline = buffered.indexOf('\n')
    }
  }
  if (count !== chunks.length || buffered !== '') throw new Error('Unexpected stream length')
}

const inProcessTransportClient = defineClient(transportContract, {
  transport: inProcessTransport(transportImplementation),
})
const inProcessCodecClient = defineClient(codecContract, { transport: inProcessTransport(codecImplementation) })
const inProcessStreamClient = defineClient(streamContract, { transport: inProcessTransport(streamImplementation) })

export const hullaApiBreakdownBenchmarks: readonly Benchmark[] = (
  [
    {
      runtime: '@hulla/api in-process',
      scenario: 'dynamic-http',
      async run() {
        const result = await inProcessTransportClient.item({
          params: { id: transportValue.id },
          query: { limit: transportValue.limit },
          headers: { 'x-token': transportValue.token },
        })
        if (result.status !== 200 || result.body.id !== transportValue.id)
          throw new Error('Unexpected transport result')
      },
    },
    {
      runtime: '@hulla/api in-process',
      scenario: 'codec-roundtrip',
      async run() {
        const result = await inProcessCodecClient.echo({ body: codecValue })
        if (result.status !== 200 || result.body.createdAt.getTime() !== codecValue.createdAt.getTime())
          throw new Error('Unexpected codec result')
      },
    },
    {
      runtime: '@hulla/api in-process',
      scenario: 'streaming',
      async run() {
        const result = await inProcessStreamClient.events()
        let count = 0
        for await (const chunk of result.body) {
          if (chunk.sequence !== count++) throw new Error('Unexpected stream value')
        }
        if (count !== chunks.length) throw new Error('Unexpected stream length')
      },
    },
    { runtime: 'Direct Fetch', scenario: 'wire-dispatch', run: directWireDispatch },
    { runtime: '@hulla/api Fetch', scenario: 'wire-dispatch', run: hullaApiFetchDispatch },
    { runtime: '@hulla/api Adapter', scenario: 'wire-dispatch', run: hullaApiWireDispatch },
    { runtime: 'Direct Fetch', scenario: 'dynamic-http', run: directTransport },
    {
      runtime: '@hulla/api',
      scenario: 'dynamic-http',
      async run() {
        const result = await transportClient.item({
          params: { id: transportValue.id },
          query: { limit: transportValue.limit },
          headers: { 'x-token': transportValue.token },
        })
        if (result.status !== 200 || result.body.id !== transportValue.id)
          throw new Error('Unexpected transport result')
      },
    },
    { runtime: 'Direct Fetch', scenario: 'middleware-context', run: directMiddleware },
    {
      runtime: '@hulla/api',
      scenario: 'middleware-context',
      async run() {
        const result = await middlewareClient.protected()
        if (result.status !== 200 || result.body !== 'ok') throw new Error('Unexpected middleware result')
      },
    },
    { runtime: 'Direct Fetch', scenario: 'validation-failure', run: directFailure },
    {
      runtime: '@hulla/api',
      scenario: 'validation-failure',
      async run() {
        const result = await failureHandler(
          new Request('https://bench.local/failure', {
            method: 'POST',
            headers: { 'content-type': 'application/json' },
            body: invalidBody,
          })
        )
        if (result.status !== 400) throw new Error('Expected validation failure')
      },
    },
    { runtime: 'Direct Fetch', scenario: 'codec-roundtrip', run: directCodecRoundtrip },
    { runtime: '@hulla/api', scenario: 'codec-roundtrip', run: hullaApiCodecRoundtrip },
    { runtime: 'Direct Fetch', scenario: 'streaming', run: directStream },
    {
      runtime: '@hulla/api',
      scenario: 'streaming',
      async run() {
        const result = await streamClient.events()
        if (result.status !== 200) throw new Error('Unexpected stream status')
        let count = 0
        for await (const value of result.body) {
          if (value.sequence !== count) throw new Error('Unexpected stream value')
          count += 1
        }
        if (count !== chunks.length) throw new Error('Unexpected stream length')
      },
    },
  ] satisfies readonly Benchmark[]
).map((benchmark) => ({ ...benchmark, profile: 'focused' }))
