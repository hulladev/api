import assert from 'node:assert/strict'
import { createServer, type RequestListener } from 'node:http'
import { monitorEventLoopDelay, performance } from 'node:perf_hooks'
import { MessageChannel } from 'node:worker_threads'
import { defineContract, request, response, route, type ContractRoutes } from '@hulla/api'
import { messagePortAdapter, messagePortTransport } from '@hulla/api-message-port'
import { nodeHttpAdapter } from '@hulla/api-node/http'
import { createAdapterHandler, readFetchBody } from '@hulla/api/adapters'
import { createClient } from '@hulla/api/client'
import { fetchAdapter, fetchTransport } from '@hulla/api/fetch'
import { inProcessTransport } from '@hulla/api/in-process'
import { defineServer } from '@hulla/api/server'
import { z } from 'zod'

export type Diagnostic = {
  readonly operation: string
  readonly dimensions: Readonly<Record<string, string | number>>
  readonly latencyMs: readonly number[]
  readonly elapsedMs: number
  readonly operationsPerSecond: number
  readonly heapDeltaBytes: number
  readonly rssBytes: number
  readonly eventLoopP99Ms: number
  readonly eventLoopUtilization: number
  readonly failures?: number
  readonly arrivals?: readonly { scheduledMs: number; dispatchedMs: number; completedMs: number }[]
  readonly firstChunkMs?: readonly number[]
  readonly cancellationMs?: readonly number[]
}

const count = Number(process.env['BENCH_DIAGNOSTIC_REQUESTS'] ?? 200)
if (!Number.isSafeInteger(count) || count < 1) throw new Error('BENCH_DIAGNOSTIC_REQUESTS must be positive')
const output = z.object({ value: z.string() })

async function measure(
  operation: string,
  dimensions: Diagnostic['dimensions'],
  run: (index: number) => Promise<void>,
  concurrency = 1
): Promise<Diagnostic> {
  // Untimed semantic check and warmup use the same operation as the measurement.
  for (let i = 0; i < Math.min(count, 20); i++) await run(i)
  const delay = monitorEventLoopDelay({ resolution: 10 })
  delay.enable()
  const utilization = performance.eventLoopUtilization()
  const heap = process.memoryUsage().heapUsed
  const latencyMs: number[] = []
  let cursor = 0
  const started = performance.now()
  await Promise.all(
    Array.from({ length: concurrency }, async () => {
      while (cursor < count) {
        const index = cursor++
        const start = performance.now()
        await run(index)
        latencyMs.push(performance.now() - start)
      }
    })
  )
  const elapsedMs = performance.now() - started
  const memory = process.memoryUsage()
  delay.disable()
  return {
    operation,
    dimensions,
    latencyMs,
    elapsedMs,
    operationsPerSecond: (count / elapsedMs) * 1000,
    heapDeltaBytes: memory.heapUsed - heap,
    rssBytes: memory.rss,
    eventLoopP99Ms: delay.percentile(99) / 1e6,
    eventLoopUtilization: performance.eventLoopUtilization(utilization).utilization,
  }
}

export async function scaling(): Promise<Diagnostic[]> {
  const results: Diagnostic[] = []
  for (const routes of [1, 32, 256, 2048]) {
    const definitions: ContractRoutes = Object.fromEntries(
      Array.from({ length: routes }, (_, i) => [
        `r${i}`,
        route.get(`/resources/${i}/:id`, {
          params: z.object({ id: z.string() }),
          responses: { 200: response.json(output) },
        }),
      ])
    )
    const contract = defineContract({ routes: definitions })
    const handlers = Object.fromEntries(
      Object.keys(definitions).map((key) => [key, () => ({ status: 200 as const, body: { value: key } })])
    )
    for (const middleware of [0, 1, 5]) {
      let server = defineServer(contract)
      for (let i = 0; i < middleware; i++) server = server.use(async ({ next }) => next())
      const dispatch = createAdapterHandler(server.implement(handlers as never))
      results.push(
        await measure(
          'route-dispatch',
          { routes, middleware, distribution: 'uniform hits + 10% misses + 10% wrong method' },
          async (index) => {
            const miss = index % 10 === 8
            const wrongMethod = index % 10 === 9
            const result = await dispatch({
              request: undefined,
              method: wrongMethod ? 'POST' : 'GET',
              pathname: miss ? '/missing' : `/resources/${(index * 7919) % routes}/item`,
            })
            assert.equal(result.status, miss ? 404 : wrongMethod ? 405 : 200)
          }
        )
      )
    }
  }
  for (const bytes of [1024, 16384, 262144, 1048576]) {
    const contract = defineContract({
      routes: { echo: route.post('/', { body: request.json(output), responses: { 200: response.json(output) } }) },
    })
    const implementation = defineServer(contract).implement({ echo: ({ body }) => ({ status: 200, body }) })
    const clients = {
      'in-process': createClient(contract, { transport: inProcessTransport(implementation) }),
      fetch: createClient(contract, {
        transport: fetchTransport({
          baseUrl: 'http://bench',
          fetch: fetchAdapter({ maxBodyBytes: Infinity }).mount(implementation),
        }),
      }),
    }
    const value = 'x'.repeat(bytes)
    for (const [transport, client] of Object.entries(clients))
      results.push(
        await measure(
          'payload-roundtrip',
          {
            transport,
            bytes,
            serializedBytes: JSON.stringify({ value }).length,
            bodyLimit: 'unbounded (includes 1 MiB payload plus JSON envelope)',
          },
          async () => {
            assert.equal((await client.echo({ body: { value } })).body.value.length, bytes)
          }
        )
      )
  }

  for (const payloadBytes of [256, 16_384, 262_144]) {
    const value = 'x'.repeat(payloadBytes)
    const encoded = new TextEncoder().encode(JSON.stringify({ value }))
    for (const chunkBytes of [1024, 65_536]) {
      for (const limit of [1_048_576, Infinity]) {
        results.push(
          await measure(
            'chunked-fetch-body',
            {
              payloadBytes,
              wireBytes: encoded.byteLength,
              chunkBytes,
              policy: limit === Infinity ? 'unbounded native reader' : 'bounded 1 MiB reader',
            },
            async () => {
              let offset = 0
              const body = new ReadableStream<Uint8Array>({
                pull(controller) {
                  if (offset >= encoded.length) controller.close()
                  else {
                    controller.enqueue(encoded.subarray(offset, offset + chunkBytes))
                    offset += chunkBytes
                  }
                },
              })
              const request = new Request('https://body.bench', { method: 'POST', body, duplex: 'half' } as RequestInit)
              assert.deepEqual(await readFetchBody(request, 'json', false, limit), { value })
            }
          )
        )
      }
    }
  }
  return results
}

export async function sockets(): Promise<Diagnostic[]> {
  const contract = defineContract({
    routes: {
      get: route.get('/:id', { params: z.object({ id: z.string() }), responses: { 200: response.json(output) } }),
    },
  })
  const implementation = defineServer(contract).implement({
    get: ({ params }) => ({ status: 200, body: { value: params.id } }),
  })
  const pathSchema = z.object({ id: z.string() })
  const direct: RequestListener = (req, res) => {
    if (req.method !== 'GET') {
      res.writeHead(405)
      res.end()
      return
    }
    const id = decodeURIComponent(req.url!.slice(1))
    pathSchema.parse({ id })
    const body = output.parse({ value: id })
    res.writeHead(200, { 'content-type': 'application/json' })
    res.end(JSON.stringify(body))
  }
  const results: Diagnostic[] = []
  for (const [implementationName, handler] of [
    ['direct', direct],
    ['@hulla/api', nodeHttpAdapter().mount(implementation)],
  ] as const) {
    const server = createServer(handler)
    await new Promise<void>((resolve) => server.listen(0, '127.0.0.1', resolve))
    const address = server.address()
    assert(address !== null && typeof address === 'object')
    const origin = `http://127.0.0.1:${address.port}`
    try {
      for (const concurrency of [1, 16, 64])
        results.push(
          await measure(
            'socket-load',
            {
              implementation: implementationName,
              concurrency,
              policy: 'server input/output validation; client JSON decode',
            },
            async (index) => {
              const result = await fetch(`${origin}/item-${index}`)
              assert.equal(result.status, 200)
              assert.deepEqual(await result.json(), { value: `item-${index}` })
            },
            concurrency
          )
        )
      for (const rate of [100, 1000, 5000]) results.push(await offeredLoad(origin, implementationName, rate))
    } finally {
      server.closeAllConnections()
      await new Promise<void>((resolve, reject) =>
        server.close((error) =>
          error && (error as NodeJS.ErrnoException).code !== 'ERR_SERVER_NOT_RUNNING' ? reject(error) : resolve()
        )
      )
    }
  }
  return results
}

async function offeredLoad(origin: string, implementation: string, offeredPerSecond: number): Promise<Diagnostic> {
  const durationMs = Number(process.env['BENCH_LOAD_DURATION_MS'] ?? 1000)
  if (!Number.isFinite(durationMs) || durationMs < 1) throw new Error('BENCH_LOAD_DURATION_MS must be positive')
  const requests = Math.ceil((offeredPerSecond * durationMs) / 1000)
  const delay = monitorEventLoopDelay({ resolution: 10 })
  delay.enable()
  const utilization = performance.eventLoopUtilization()
  const heap = process.memoryUsage().heapUsed
  const start = performance.now()
  let failures = 0
  const arrivals = await Promise.all(
    Array.from(
      { length: requests },
      (_, index) =>
        new Promise<{ scheduledMs: number; dispatchedMs: number; completedMs: number }>((resolve) => {
          const scheduledMs = (index / offeredPerSecond) * 1000
          setTimeout(
            async () => {
              const dispatchedMs = performance.now() - start
              try {
                const response = await fetch(`${origin}/item-${index}`, { signal: AbortSignal.timeout(5000) })
                assert.equal(response.status, 200)
                assert.deepEqual(await response.json(), { value: `item-${index}` })
              } catch {
                failures++
              }
              resolve({ scheduledMs, dispatchedMs, completedMs: performance.now() - start })
            },
            Math.max(0, start + scheduledMs - performance.now())
          )
        })
    )
  )
  const elapsedMs = performance.now() - start
  delay.disable()
  return {
    operation: 'socket-offered-load',
    dimensions: { implementation, offeredPerSecond, durationMs },
    arrivals,
    failures,
    latencyMs: arrivals.map((item) => item.completedMs - item.scheduledMs),
    elapsedMs,
    operationsPerSecond: ((requests - failures) / elapsedMs) * 1000,
    heapDeltaBytes: process.memoryUsage().heapUsed - heap,
    rssBytes: process.memoryUsage().rss,
    eventLoopP99Ms: delay.percentile(99) / 1e6,
    eventLoopUtilization: performance.eventLoopUtilization(utilization).utilization,
  }
}

export async function ipc(): Promise<Diagnostic[]> {
  const contract = defineContract({
    routes: { echo: route.post('/', { body: request.json(output), responses: { 200: response.json(output) } }) },
  })
  const implementation = defineServer(contract).implement({ echo: ({ body }) => ({ status: 200, body }) })
  const channel = new MessageChannel()
  const server = messagePortAdapter(channel.port1).mount(implementation)
  const transport = messagePortTransport(channel.port2)
  const client = createClient(contract, { transport })
  const results: Diagnostic[] = []
  try {
    await Promise.all([server.ready, transport.ready])
    for (const bytes of [128, 65536])
      for (const concurrency of [1, 16]) {
        const value = 'x'.repeat(bytes)
        results.push(
          await measure(
            'message-port-roundtrip',
            { bytes, concurrency },
            async () => {
              assert.equal((await client.echo({ body: { value } })).body.value, value)
            },
            concurrency
          )
        )
      }
  } finally {
    await transport.close()
    await server.close()
    channel.port1.close()
    channel.port2.close()
  }
  return results
}

export async function lifecycle(): Promise<Diagnostic[]> {
  let finalized = 0
  const contract = defineContract({
    routes: {
      stream: route.get('/stream', { responses: { 200: response.stream() } }),
      fail: route.get('/fail', { responses: { 200: response.text() } }),
      input: route.post('/input', { body: request.json(output), responses: { 200: response.json(output) } }),
    },
  })
  const implementation = defineServer(contract).implement({
    stream: () => ({
      status: 200,
      body: (async function* () {
        try {
          for (let i = 0; i < 16; i++) {
            await new Promise((resolve) => setTimeout(resolve, 1))
            yield new Uint8Array(4096)
          }
        } finally {
          finalized++
        }
      })(),
    }),
    fail: () => {
      throw new Error('expected failure')
    },
    input: ({ body }) => ({ status: 200, body }),
  })
  const handler = fetchAdapter().mount(implementation)
  const results: Diagnostic[] = []
  for (const cancel of [false, true]) {
    const firstChunkMs: number[] = []
    const cancellationMs: number[] = []
    const measurement = await measure(
      'stream-lifetime',
      { cancel: String(cancel), bytes: 65536, producerDelayMs: 1, consumerDelayMs: 1 },
      async () => {
        const before = finalized
        const start = performance.now()
        const result = await handler(new Request('http://bench/stream'))
        const reader = result.body!.getReader()
        const first = await reader.read()
        firstChunkMs.push(performance.now() - start)
        if (cancel) {
          const start = performance.now()
          await reader.cancel()
          cancellationMs.push(performance.now() - start)
        } else {
          let size = first.value!.byteLength
          while (true) {
            await new Promise((resolve) => setTimeout(resolve, 1))
            const item = await reader.read()
            if (item.done) break
            size += item.value.byteLength
          }
          assert.equal(size, 65536)
        }
        assert.equal(finalized, before + 1)
      }
    )
    // Drop the untimed warmup observations.
    results.push({
      ...measurement,
      firstChunkMs: firstChunkMs.slice(-count),
      cancellationMs: cancellationMs.slice(-count),
    })
  }
  for (const mode of ['handler-failure', 'invalid-input', 'abort'] as const)
    results.push(
      await measure(mode, {}, async () => {
        const controller = new AbortController()
        if (mode === 'abort') controller.abort()
        const request = new Request(`http://bench/${mode === 'handler-failure' ? 'fail' : 'input'}`, {
          method: mode === 'handler-failure' ? 'GET' : 'POST',
          signal: controller.signal,
          ...(mode === 'handler-failure' ? {} : { headers: { 'content-type': 'application/json' }, body: '{}' }),
        })
        const result = await handler(request)
        assert.equal(result.status, mode === 'handler-failure' || mode === 'abort' ? 500 : 400)
        await result.text()
      })
    )
  return results
}
