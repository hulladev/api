import { defineContract, response, route } from '@hulla/api'
import { codec as zodCodec } from '@hulla/api-zod'
import { defineClient } from '@hulla/api/client'
import { createFetchHandler, defineServer } from '@hulla/api/server'
import { ndjson } from '@hulla/api/stream'
import { createWireHandler } from '@hulla/api/wire'
import { z } from 'zod'
import type { Benchmark } from './harness'
import { encodeValue } from './scenario'

const parameterSchema = z.object({ id: z.string() })
const querySchema = z.object({ limit: z.string().regex(/^\d+$/) })
const headerSchema = z.object({ 'x-token': z.string().min(1) })
const transportOutput = z.object({ id: z.string(), limit: z.string(), token: z.string() })
const transportValue = { id: 'item/42', limit: '10', token: 'secret' }

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
const transportHandler = createFetchHandler(
  transportServer.build({
    item: (input) => ({
      status: 200,
      body: { id: input.params.id, limit: input.query.limit, token: input.headers['x-token'] },
    }),
  })
)
const transportClient = defineClient(transportContract, {
  baseUrl: 'https://bench.local',
  fetch: transportHandler,
}).build()

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
const middlewareServerBase = defineServer(middlewareContract, {
  context: ({ request }) => ({ token: request.headers.get('authorization') ?? '' }),
})
const serverMiddleware = middlewareServerBase.middleware((input, next) => {
  if (input.context.token !== 'Bearer benchmark') throw new Error('Missing benchmark token')
  return next()
})
const middlewareServer = middlewareServerBase.use(serverMiddleware)
const middlewareHandler = createFetchHandler(middlewareServer.build({ protected: () => ({ status: 200, body: 'ok' }) }))
const middlewareClientBase = defineClient(middlewareContract, {
  baseUrl: 'https://bench.local',
  fetch: middlewareHandler,
  headers: { authorization: 'Bearer benchmark' },
  context: ({ request }) => ({ method: request.method }),
})
const clientMiddleware = middlewareClientBase.middleware((input, next) => {
  if (input.context.method !== 'GET') throw new Error('Unexpected method')
  return next()
})
const middlewareClient = middlewareClientBase.use(clientMiddleware).build()

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
const failureHandler = createFetchHandler(failureServer.build({ failure: () => ({ status: 204 }) }))
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
const adapterImplementation = adapterServer.build({
  execute: (input) => ({ status: 200, body: { doubled: input.body.value * 2 } }),
})
const adapterFetch = createFetchHandler(adapterImplementation)
const adapterWire = createWireHandler(adapterImplementation)

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
    request: { adapter: 'benchmark' },
    method: 'POST',
    pathname: '/execute',
    headers: { 'content-type': 'application/json' },
    body: { value: adapterValue, contentType: 'application/json' },
  })
  if (responseValue.body.kind !== 'json') throw new Error('Unexpected wire response representation')
  const output = adapterOutput.parse(responseValue.body.value)
  if (output.doubled !== 42) throw new Error('Unexpected wire adapter result')
}

const nativeDateCodec = z.object({
  createdAt: z.codec(z.iso.datetime(), z.date(), {
    decode: (value) => new Date(value),
    encode: (value) => value.toISOString(),
  }),
})
const dateCodec = zodCodec(nativeDateCodec)
const codecValue = { createdAt: new Date('2026-08-16T12:00:00.000Z') }
const codecContract = defineContract({
  routes: {
    echo: route.post('/codec', { body: dateCodec, responses: { 200: response.json(dateCodec) } }),
  },
})
const codecServer = defineServer(codecContract)
const codecHandler = createFetchHandler(codecServer.build({ echo: (input) => ({ status: 200, body: input.body }) }))
const codecClient = defineClient(codecContract, { baseUrl: 'https://bench.local', fetch: codecHandler }).build()

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
const streamHandler = createFetchHandler(streamServer.build({ events: () => ({ status: 200, body: chunks }) }))
const streamClient = defineClient(streamContract, { baseUrl: 'https://bench.local', fetch: streamHandler }).build()

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

export const hullaApiBreakdownBenchmarks: readonly Benchmark[] = (
  [
    { runtime: 'Direct Fetch', scenario: 'wire-dispatch', run: directWireDispatch },
    { runtime: '@hulla/api Fetch', scenario: 'wire-dispatch', run: hullaApiFetchDispatch },
    { runtime: '@hulla/api Wire', scenario: 'wire-dispatch', run: hullaApiWireDispatch },
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
