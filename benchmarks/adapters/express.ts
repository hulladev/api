import { EventEmitter, once } from 'node:events'
import type { AddressInfo } from 'node:net'
import { defineContract, response, route } from '@hulla/api'
import {
  expressAdapter,
  type ExpressHandler,
  type ExpressRequest,
  type ExpressResponse,
  type ExpressRouter,
} from '@hulla/api-express'
import { defineServer, type ServerExecutable } from '@hulla/api/server'
import { os } from '@orpc/server'
import { RPCHandler as ORPCNodeHandler } from '@orpc/server/node'
import { initTRPC } from '@trpc/server'
import { createExpressMiddleware as createTRPCExpressMiddleware } from '@trpc/server/adapters/express'
import { initContract, type AppRouteMutation, type AppRouteQuery, type AppRouter } from '@ts-rest/core'
import { createExpressEndpoints } from '@ts-rest/express'
import express, { type Express } from 'express'
import { z } from 'zod'
import type { Benchmark } from '../harness'

type RegisteredEndpoint = {
  readonly handlers: readonly ExpressHandler[]
  readonly method: string
  readonly path: string
}

type RecordingRouter = ExpressRouter & {
  readonly use: (...handlers: ExpressHandler[]) => unknown
}

const routeCount = 256
const targetIndex = routeCount - 1
const staticPath = `/adapter/${targetIndex}`
const dynamicPath = '/adapter/items/:id'
const staticOutput = z.object({ index: z.number().int() })
const dynamicOutput = z.object({ id: z.string(), name: z.string(), tag: z.string() })
const dynamicParams = z.object({ id: z.string() })
const dynamicQuery = z.object({ tag: z.string() })
const dynamicBody = z.object({ name: z.string() })

const routes = Object.fromEntries([
  ...Array.from({ length: routeCount }, (_, index) => [
    `route${index}`,
    route.get(`/adapter/${index}`, { responses: { 200: response.json(staticOutput) } }),
  ]),
  [
    'dynamic',
    route.post(dynamicPath, {
      params: z.object({ id: z.string() }),
      query: z.object({ tag: z.string() }),
      body: z.object({ name: z.string() }),
      responses: { 201: response.json(dynamicOutput) },
    }),
  ],
])
const contract = defineContract({ routes })
const handlers = Object.fromEntries([
  ...Array.from({ length: routeCount }, (_, index) => [
    `route${index}`,
    () => ({ status: 200 as const, body: { index } }),
  ]),
  [
    'dynamic',
    (input: {
      readonly body: { readonly name: string }
      readonly params: { readonly id: string }
      readonly query: { readonly tag: string }
    }) => ({
      status: 201 as const,
      body: { id: input.params.id, name: input.body.name, tag: input.query.tag },
    }),
  ],
])
const implementation = defineServer(contract).implement(handlers)

function recordingRouter(): { readonly endpoints: readonly RegisteredEndpoint[]; readonly router: RecordingRouter } {
  const endpoints: RegisteredEndpoint[] = []
  const registrar =
    (method: string) =>
    (path: string, ...registeredHandlers: ExpressHandler[]) => {
      if (registeredHandlers.length === 0) throw new Error('Missing registered adapter handler')
      endpoints.push({ handlers: registeredHandlers, method, path })
    }
  const router: RecordingRouter = {
    delete: registrar('DELETE'),
    get: registrar('GET'),
    patch: registrar('PATCH'),
    post: registrar('POST'),
    put: registrar('PUT'),
    query: registrar('QUERY'),
    use: (...registeredHandlers) => {
      if (registeredHandlers.length === 0) throw new Error('Missing registered Express middleware')
    },
  }
  return { endpoints, router }
}

function captureHullaEndpoints(value: ServerExecutable): readonly RegisteredEndpoint[] {
  const recorded = recordingRouter()
  expressAdapter(recorded.router).mount(value)
  return recorded.endpoints
}

function benchmarkRequest(overrides: Partial<ExpressRequest>): ExpressRequest {
  const events = new EventEmitter()
  const request = {
    headers: { host: 'bench.local' },
    method: 'GET',
    params: {},
    protocol: 'https',
    socket: {},
    url: '/',
    on(event: string | symbol, listener: (...arguments_: unknown[]) => void) {
      events.on(event, listener)
      return request
    },
    off(event: string | symbol, listener: (...arguments_: unknown[]) => void) {
      events.off(event, listener)
      return request
    },
    once(event: string | symbol, listener: (...arguments_: unknown[]) => void) {
      events.once(event, listener)
      return request
    },
    ...overrides,
  } as unknown as ExpressRequest
  return request
}

type RecordedResponse = {
  readonly body: () => Uint8Array
  readonly finished: Promise<void>
  readonly response: ExpressResponse
  readonly status: () => number
}

function benchmarkResponse(): RecordedResponse {
  const events = new EventEmitter()
  const chunks: Uint8Array[] = []
  let complete: (() => void) | undefined
  const finished = new Promise<void>((resolve) => {
    complete = resolve
  })
  let statusCode = 200
  let ended = false
  let headersSent = false
  const append = (value: unknown): void => {
    if (value === undefined || value === null) return
    if (typeof value === 'string') chunks.push(new TextEncoder().encode(value))
    else if (value instanceof Uint8Array) chunks.push(value)
    else throw new TypeError('Unexpected benchmark response chunk')
  }
  const finish = (): void => {
    if (ended) return
    ended = true
    events.emit('finish')
    events.emit('close')
    complete?.()
  }
  const response = {
    get closed() {
      return ended
    },
    get destroyed() {
      return false
    },
    get errored() {
      return null
    },
    get headersSent() {
      return headersSent
    },
    locals: {},
    get statusCode() {
      return statusCode
    },
    set statusCode(code: number) {
      statusCode = code
    },
    get writableFinished() {
      return ended
    },
    get writableEnded() {
      return ended
    },
    destroy(error?: Error) {
      if (error !== undefined) events.emit('error', error)
      finish()
      return response
    },
    emit(event: string | symbol, ...arguments_: unknown[]) {
      return events.emit(event, ...arguments_)
    },
    end(value?: unknown) {
      append(value)
      finish()
      return response
    },
    json(value: unknown) {
      chunks.push(new TextEncoder().encode(JSON.stringify(value)))
      finish()
      return response
    },
    on(event: string | symbol, listener: (...arguments_: unknown[]) => void) {
      events.on(event, listener)
      return response
    },
    off(event: string | symbol, listener: (...arguments_: unknown[]) => void) {
      events.off(event, listener)
      return response
    },
    once(event: string | symbol, listener: (...arguments_: unknown[]) => void) {
      events.once(event, listener)
      return response
    },
    removeListener(event: string | symbol, listener: (...arguments_: unknown[]) => void) {
      events.removeListener(event, listener)
      return response
    },
    setHeader() {
      return response
    },
    send(value: string | Uint8Array) {
      append(value)
      finish()
      return response
    },
    status(code: number) {
      statusCode = code
      return response
    },
    write(chunk: string | Uint8Array) {
      headersSent = true
      append(chunk)
      return true
    },
    writeHead(code: number) {
      statusCode = code
      headersSent = true
      return response
    },
  } as unknown as ExpressResponse

  return {
    body: () => {
      const length = chunks.reduce((total, chunk) => total + chunk.byteLength, 0)
      const result = new Uint8Array(length)
      let offset = 0
      for (const chunk of chunks) {
        result.set(chunk, offset)
        offset += chunk.byteLength
      }
      return result
    },
    finished,
    response,
    status: () => statusCode,
  }
}

async function runEndpoint(
  endpoint: RegisteredEndpoint,
  request: ExpressRequest,
  recorded: RecordedResponse
): Promise<void> {
  const run = async (index: number): Promise<void> => {
    const handler = endpoint.handlers[index]
    if (handler === undefined) return
    let continued: Promise<void> | undefined
    let error: unknown
    await handler(request, recorded.response, (nextError) => {
      if (nextError !== undefined) error = nextError
      else continued = run(index + 1)
    })
    if (error !== undefined) throw error
    await continued
  }
  await run(0)
  await recorded.finished
}

function requiredEndpoint(endpoints: readonly RegisteredEndpoint[], path: string): RegisteredEndpoint {
  const endpoint = endpoints.find((candidate) => candidate.path === path)
  if (endpoint === undefined) throw new Error(`Missing benchmark endpoint ${path}`)
  return endpoint
}

const hullaEndpoints = captureHullaEndpoints(implementation as ServerExecutable)
const hullaStaticEndpoint = requiredEndpoint(hullaEndpoints, staticPath)
const hullaDynamicEndpoint = requiredEndpoint(hullaEndpoints, dynamicPath)

const staticRequest = benchmarkRequest({ originalUrl: staticPath, url: staticPath })
const dynamicRequest = benchmarkRequest({
  body: { name: 'Ada' },
  headers: { host: 'bench.local', 'content-type': 'application/json' },
  method: 'POST',
  originalUrl: '/adapter/items/item-42?tag=bench',
  params: { id: 'item-42' },
  query: { tag: 'bench' },
  url: '/adapter/items/item-42?tag=bench',
})

function registerDirectExpress(): readonly RegisteredEndpoint[] {
  const recorded = recordingRouter()
  for (let index = 0; index < routeCount; index++) {
    recorded.router.get(`/adapter/${index}`, (_request, result) => {
      result.status(200).json(staticOutput.parse({ index }))
    })
  }
  recorded.router.post(dynamicPath, (request, result) => {
    const params = dynamicParams.parse(request.params)
    const query = dynamicQuery.parse(request.query)
    const body = dynamicBody.parse(request.body)
    result.status(201).json(dynamicOutput.parse({ id: params.id, name: body.name, tag: query.tag }))
  })
  return recorded.endpoints
}

const directEndpoints = registerDirectExpress()
const directStaticEndpoint = requiredEndpoint(directEndpoints, staticPath)
const directDynamicEndpoint = requiredEndpoint(directEndpoints, dynamicPath)

const tsContractBuilder = initContract()
const tsStaticOutput = z.object({ index: z.number().int() })
const tsDynamicOutput = z.object({ id: z.string(), name: z.string(), tag: z.string() })
const tsRoutes: Record<string, AppRouteQuery | AppRouteMutation> = Object.fromEntries([
  ...Array.from({ length: routeCount }, (_, index) => [
    `route${index}`,
    {
      method: 'GET' as const,
      path: `/adapter/${index}`,
      responses: { 200: tsStaticOutput },
    },
  ]),
  [
    'dynamic',
    {
      method: 'POST' as const,
      path: dynamicPath,
      pathParams: z.object({ id: z.string() }),
      query: z.object({ tag: z.string() }),
      body: z.object({ name: z.string() }),
      responses: { 201: tsDynamicOutput },
    },
  ],
])
const tsContract: AppRouter = tsContractBuilder.router(tsRoutes)
const tsHandlers = Object.fromEntries([
  ...Array.from({ length: routeCount }, (_, index) => [
    `route${index}`,
    async () => ({ status: 200 as const, body: { index } }),
  ]),
  [
    'dynamic',
    async (input: {
      readonly body: { readonly name: string }
      readonly params: { readonly id: string }
      readonly query: { readonly tag: string }
    }) => ({
      status: 201 as const,
      body: { id: input.params.id, name: input.body.name, tag: input.query.tag },
    }),
  ],
])

function captureTsRestEndpoints(): readonly RegisteredEndpoint[] {
  const recorded = recordingRouter()
  type Implementation = Parameters<typeof createExpressEndpoints>[1]
  type Router = Parameters<typeof createExpressEndpoints>[2]
  createExpressEndpoints(tsContract, tsHandlers as Implementation, recorded.router as unknown as Router, {
    logInitialization: false,
    responseValidation: true,
  })
  return recorded.endpoints
}

const tsRestEndpoints = captureTsRestEndpoints()
const tsRestStaticEndpoint = requiredEndpoint(tsRestEndpoints, staticPath)
const tsRestDynamicEndpoint = requiredEndpoint(tsRestEndpoints, dynamicPath)

const rpcStaticKey = `route${targetIndex}`
const t = initTRPC.create()
const trpcProcedures = Object.fromEntries([
  ...Array.from({ length: routeCount }, (_, index) => [
    `route${index}`,
    t.procedure.output(staticOutput).query(() => ({ index })),
  ]),
  [
    'dynamic',
    t.procedure
      .input(dynamicOutput)
      .output(dynamicOutput)
      .mutation(({ input }) => input),
  ],
])
const trpcRouter = t.router(trpcProcedures)
const trpcEndpoint: RegisteredEndpoint = {
  handlers: [createTRPCExpressMiddleware({ router: trpcRouter })],
  method: 'USE',
  path: '/trpc',
}
const trpcStaticRequest = benchmarkRequest({
  originalUrl: `/trpc/${rpcStaticKey}`,
  path: `/trpc/${rpcStaticKey}`,
  url: `/trpc/${rpcStaticKey}`,
})
const trpcDynamicRequest = benchmarkRequest({
  body: { id: 'item-42', name: 'Ada', tag: 'bench' },
  headers: { host: 'bench.local', 'content-type': 'application/json' },
  method: 'POST',
  originalUrl: '/trpc/dynamic',
  path: '/trpc/dynamic',
  url: '/trpc/dynamic',
})

const orpcRouter = Object.fromEntries([
  ...Array.from({ length: routeCount }, (_, index) => [
    `route${index}`,
    os.output(staticOutput).handler(() => ({ index })),
  ]),
  [
    'dynamic',
    os
      .input(dynamicOutput)
      .output(dynamicOutput)
      .handler(({ input }) => input),
  ],
])
const orpcHandler = new ORPCNodeHandler(orpcRouter)
const orpcMiddleware: ExpressHandler = async (request, response, next) => {
  try {
    const result = await orpcHandler.handle(request, response, { prefix: '/rpc', context: {} })
    if (!result.matched) next()
  } catch (error) {
    next(error)
  }
}
const orpcEndpoint: RegisteredEndpoint = { handlers: [orpcMiddleware], method: 'USE', path: '/rpc' }
const orpcStaticRequest = benchmarkRequest({
  body: {},
  headers: { host: 'bench.local', 'content-type': 'application/json' },
  method: 'POST',
  originalUrl: `/rpc/${rpcStaticKey}`,
  path: `/rpc/${rpcStaticKey}`,
  url: `/rpc/${rpcStaticKey}`,
})
const orpcDynamicRequest = benchmarkRequest({
  body: { json: { id: 'item-42', name: 'Ada', tag: 'bench' } },
  headers: { host: 'bench.local', 'content-type': 'application/json' },
  method: 'POST',
  originalUrl: '/rpc/dynamic',
  path: '/rpc/dynamic',
  url: '/rpc/dynamic',
})

type ExpressHttpTarget = {
  readonly baseUrl: string
  readonly dynamicBody: string
  readonly dynamicPath: string
  readonly protocol: 'orpc' | 'rest' | 'trpc'
  readonly staticPath: string
}

async function listen(application: Express): Promise<string> {
  const server = application.listen(0, '127.0.0.1')
  await once(server, 'listening')
  server.unref()
  const address = server.address() as AddressInfo | null
  if (address === null) throw new Error('Express benchmark server did not expose an address')
  return `http://127.0.0.1:${address.port}`
}

function directExpressApplication(): Express {
  const application = express()
  application.use(express.json())
  for (let index = 0; index < routeCount; index++) {
    application.get(`/adapter/${index}`, (_request, result) => {
      result.status(200).json(staticOutput.parse({ index }))
    })
  }
  application.post(dynamicPath, (request, result) => {
    const params = dynamicParams.parse(request.params)
    const query = dynamicQuery.parse(request.query)
    const body = dynamicBody.parse(request.body)
    result.status(201).json(dynamicOutput.parse({ id: params.id, name: body.name, tag: query.tag }))
  })
  return application
}

function hullaExpressApplication(): Express {
  const application = express()
  application.use(express.json())
  expressAdapter(application as unknown as ExpressRouter).mount(implementation as ServerExecutable)
  return application
}

function tsRestExpressApplication(): Express {
  const application = express()
  application.use(express.json())
  type Implementation = Parameters<typeof createExpressEndpoints>[1]
  type Router = Parameters<typeof createExpressEndpoints>[2]
  createExpressEndpoints(tsContract, tsHandlers as Implementation, application as unknown as Router, {
    logInitialization: false,
    responseValidation: true,
  })
  return application
}

function trpcExpressApplication(): Express {
  const application = express()
  application.use(express.json())
  application.use('/trpc', createTRPCExpressMiddleware({ router: trpcRouter }))
  return application
}

function orpcExpressApplication(): Express {
  const application = express()
  application.use(express.json())
  application.use(orpcMiddleware as never)
  return application
}

const [directHttpBase, hullaHttpBase, tsRestHttpBase, trpcHttpBase, orpcHttpBase] = await Promise.all([
  listen(directExpressApplication()),
  listen(hullaExpressApplication()),
  listen(tsRestExpressApplication()),
  listen(trpcExpressApplication()),
  listen(orpcExpressApplication()),
])

const expressHttpTargets: Readonly<Record<'direct' | 'hulla' | 'orpc' | 'trpc' | 'ts-rest', ExpressHttpTarget>> = {
  direct: {
    baseUrl: directHttpBase,
    dynamicBody: JSON.stringify({ name: 'Ada' }),
    dynamicPath: '/adapter/items/item-42?tag=bench',
    protocol: 'rest',
    staticPath,
  },
  hulla: {
    baseUrl: hullaHttpBase,
    dynamicBody: JSON.stringify({ name: 'Ada' }),
    dynamicPath: '/adapter/items/item-42?tag=bench',
    protocol: 'rest',
    staticPath,
  },
  'ts-rest': {
    baseUrl: tsRestHttpBase,
    dynamicBody: JSON.stringify({ name: 'Ada' }),
    dynamicPath: '/adapter/items/item-42?tag=bench',
    protocol: 'rest',
    staticPath,
  },
  trpc: {
    baseUrl: trpcHttpBase,
    dynamicBody: JSON.stringify({ id: 'item-42', name: 'Ada', tag: 'bench' }),
    dynamicPath: '/trpc/dynamic',
    protocol: 'trpc',
    staticPath: `/trpc/${rpcStaticKey}`,
  },
  orpc: {
    baseUrl: orpcHttpBase,
    dynamicBody: JSON.stringify({ json: { id: 'item-42', name: 'Ada', tag: 'bench' } }),
    dynamicPath: '/rpc/dynamic',
    protocol: 'orpc',
    staticPath: `/rpc/${rpcStaticKey}`,
  },
}

async function expressHttpRoundtrip(target: ExpressHttpTarget, dynamic: boolean): Promise<void> {
  const response = await fetch(`${target.baseUrl}${dynamic ? target.dynamicPath : target.staticPath}`, {
    ...(dynamic || target.protocol === 'orpc'
      ? {
          method: 'POST',
          headers: { 'content-type': 'application/json' },
          body: dynamic ? target.dynamicBody : '{}',
        }
      : {}),
  })
  if (response.status !== (target.protocol === 'rest' && dynamic ? 201 : 200)) {
    throw new Error(`Unexpected real Express HTTP status: ${response.status}`)
  }
  const envelope = (await response.json()) as {
    readonly json?: unknown
    readonly result?: { readonly data?: unknown }
  }
  const value =
    target.protocol === 'trpc' ? envelope.result?.data : target.protocol === 'orpc' ? envelope.json : envelope
  if (dynamic) {
    const output = dynamicOutput.parse(value)
    if (output.id !== 'item-42' || output.name !== 'Ada' || output.tag !== 'bench') {
      throw new Error('Unexpected real Express HTTP dynamic result')
    }
  } else if (staticOutput.parse(value).index !== targetIndex) {
    throw new Error('Unexpected real Express HTTP static result')
  }
}

async function registration(run: () => readonly RegisteredEndpoint[]): Promise<void> {
  if (run().length !== routeCount + 1) throw new Error('Unexpected registered route count')
}

async function staticDispatch(endpoint: RegisteredEndpoint): Promise<void> {
  const recorded = benchmarkResponse()
  await runEndpoint(endpoint, staticRequest, recorded)
  const output = staticOutput.parse(JSON.parse(new TextDecoder().decode(recorded.body())))
  if (recorded.status() !== 200 || output.index !== targetIndex) throw new Error('Unexpected static adapter result')
}

async function dynamicDispatch(endpoint: RegisteredEndpoint): Promise<void> {
  const recorded = benchmarkResponse()
  await runEndpoint(endpoint, dynamicRequest, recorded)
  const output = dynamicOutput.parse(JSON.parse(new TextDecoder().decode(recorded.body())))
  if (recorded.status() !== 201 || output.id !== 'item-42' || output.name !== 'Ada' || output.tag !== 'bench') {
    throw new Error('Unexpected dynamic adapter result')
  }
}

async function rpcDispatch(
  endpoint: RegisteredEndpoint,
  request: ExpressRequest,
  protocol: 'orpc' | 'trpc',
  dynamic: boolean
): Promise<void> {
  const recorded = benchmarkResponse()
  await runEndpoint(endpoint, request, recorded)
  if (recorded.status() !== 200) throw new Error('Unexpected RPC Express adapter status')
  const envelope = JSON.parse(new TextDecoder().decode(recorded.body())) as {
    readonly json?: unknown
    readonly result?: { readonly data?: unknown }
  }
  const value = protocol === 'trpc' ? envelope.result?.data : envelope.json
  if (dynamic) {
    const output = dynamicOutput.parse(value)
    if (output.id !== 'item-42' || output.name !== 'Ada' || output.tag !== 'bench') {
      throw new Error('Unexpected dynamic RPC Express adapter result')
    }
  } else if (staticOutput.parse(value).index !== targetIndex) {
    throw new Error('Unexpected static RPC Express adapter result')
  }
}

export const adapterRuntimeBenchmarks: readonly Benchmark[] = (
  [
    { runtime: 'Direct Express', scenario: 'adapter-registration', run: () => registration(registerDirectExpress) },
    {
      runtime: '@hulla/api Express',
      scenario: 'adapter-registration',
      run: () => registration(() => captureHullaEndpoints(implementation as ServerExecutable)),
    },
    { runtime: 'ts-rest Express', scenario: 'adapter-registration', run: () => registration(captureTsRestEndpoints) },
    { runtime: 'Direct Express', scenario: 'adapter-static-dispatch', run: () => staticDispatch(directStaticEndpoint) },
    {
      runtime: '@hulla/api Express',
      scenario: 'adapter-static-dispatch',
      run: () => staticDispatch(hullaStaticEndpoint),
    },
    {
      runtime: 'ts-rest Express',
      scenario: 'adapter-static-dispatch',
      run: () => staticDispatch(tsRestStaticEndpoint),
    },
    {
      runtime: 'tRPC Express',
      scenario: 'adapter-static-dispatch',
      run: () => rpcDispatch(trpcEndpoint, trpcStaticRequest, 'trpc', false),
    },
    {
      runtime: 'oRPC Express/Node',
      scenario: 'adapter-static-dispatch',
      run: () => rpcDispatch(orpcEndpoint, orpcStaticRequest, 'orpc', false),
    },
    {
      runtime: 'Direct Express',
      scenario: 'adapter-dynamic-dispatch',
      run: () => dynamicDispatch(directDynamicEndpoint),
    },
    {
      runtime: '@hulla/api Express',
      scenario: 'adapter-dynamic-dispatch',
      run: () => dynamicDispatch(hullaDynamicEndpoint),
    },
    {
      runtime: 'ts-rest Express',
      scenario: 'adapter-dynamic-dispatch',
      run: () => dynamicDispatch(tsRestDynamicEndpoint),
    },
    {
      runtime: 'tRPC Express',
      scenario: 'adapter-dynamic-dispatch',
      run: () => rpcDispatch(trpcEndpoint, trpcDynamicRequest, 'trpc', true),
    },
    {
      runtime: 'oRPC Express/Node',
      scenario: 'adapter-dynamic-dispatch',
      run: () => rpcDispatch(orpcEndpoint, orpcDynamicRequest, 'orpc', true),
    },
    ...(
      [
        ['Direct Express', expressHttpTargets.direct],
        ['@hulla/api Express', expressHttpTargets.hulla],
        ['ts-rest Express', expressHttpTargets['ts-rest']],
        ['tRPC Express', expressHttpTargets.trpc],
        ['oRPC Express/Node', expressHttpTargets.orpc],
      ] as const
    ).flatMap(([runtime, target]) => [
      {
        iterations: 100,
        runtime,
        scenario: 'express-http-static-roundtrip' as const,
        run: () => expressHttpRoundtrip(target, false),
        warmup: 25,
      },
      {
        iterations: 100,
        runtime,
        scenario: 'express-http-dynamic-roundtrip' as const,
        run: () => expressHttpRoundtrip(target, true),
        warmup: 25,
      },
    ]),
  ] satisfies readonly Benchmark[]
).map((benchmark) => ({ ...benchmark, profile: 'native' }))
