import { execFileSync } from 'node:child_process'
import { describe, expect, test, vi } from 'vitest'
import { z } from 'zod'
import { defineContract, response, route, router } from '../src'
import { createClient } from '../src/client'
import { fetchAdapter, fetchTransport } from '../src/fetch'
import { inProcessTransport } from '../src/in-process'
import { defineServer } from '../src/server'
import { codec } from '../src/validation'

const origin = 'https://lifecycle.test'

describe('request lifetime and executable client scopes', () => {
  test('stops validation at the first failed field without orphan rejections or handler execution', () => {
    const root = new URL('../src/', import.meta.url).pathname
    const zod = new URL('../node_modules/zod/index.js', import.meta.url).pathname
    const output = execFileSync(
      'bun',
      [
        '--eval',
        `
      import { z } from ${JSON.stringify(zod)};
      import { defineContract, response, route } from ${JSON.stringify(root + 'index.ts')};
      import { defineServer } from ${JSON.stringify(root + 'server/index.ts')};
      import { createAdapterHandler } from ${JSON.stringify(root + 'adapters/index.ts')};
      const failures = []; const reported = []; let calls = 0;
      process.on('unhandledRejection', error => failures.push(error.message));
      const contract = defineContract({ routes: { get: route.get('/', {
        query: z.object({ q: z.string() }).refine(async () => false, { message: 'earlier async failure' }),
        headers: z.object({ h: z.string() }).transform(() => { throw new Error('primary sync failure') }),
        responses: { 200: response.text() }
      }) } });
      const dispatch = createAdapterHandler(defineServer(contract).implement({ get: () => { calls++; return {status:200,body:'ok'} } }), { onError: ({error}) => { reported.push(error.message) } });
      const result = await dispatch({ request: undefined, method:'GET', pathname:'/', query:{q:'value'}, headers:{h:'value'} });
      await new Promise(resolve => setTimeout(resolve, 10));
      console.log(JSON.stringify({ failures, reported, calls, status:result.status }));
    `,
      ],
      { encoding: 'utf8' }
    )
    expect(JSON.parse(output)).toEqual({ failures: [], reported: ['earlier async failure'], calls: 0, status: 400 })
  })

  test('reports native serialization failures exactly once and tolerates a rejected observer', async () => {
    const contract = defineContract({ routes: { get: route.get('/', { responses: { 200: response.json(z.any()) } }) } })
    const cyclic: Record<string, unknown> = {}
    cyclic['self'] = cyclic
    const onError = vi.fn<() => void>(() => {
      throw new Error('observer failed')
    })
    const handler = fetchAdapter({ onError }).mount(
      defineServer(contract).implement({ get: () => ({ status: 200, body: cyclic }) })
    )
    const result = await handler(new Request(origin))
    expect(result.status).toBe(500)
    expect(onError).toHaveBeenCalledTimes(1)
    expect(onError).toHaveBeenCalledWith(expect.objectContaining({ phase: 'transport' }))
  })

  test('finalizes an invalid stream producer and observes the committed-stream failure', async () => {
    let finalized = false
    async function* stream() {
      try {
        yield new Uint8Array([1])
        yield 'invalid' as never
      } finally {
        finalized = true
      }
    }
    const contract = defineContract({ routes: { get: route.get('/', { responses: { 200: response.stream() } }) } })
    const onError = vi.fn<(...args: unknown[]) => void>()
    const handler = fetchAdapter({ onError }).mount(
      defineServer(contract).implement({ get: () => ({ status: 200, body: stream() }) })
    )
    const result = await handler(new Request(origin))
    await expect(result.arrayBuffer()).rejects.toThrow('Stream chunk must be Uint8Array')
    expect(finalized).toBe(true)
    expect(onError).toHaveBeenCalledTimes(1)
  })

  test('disposes a response rejected before ownership is handed to the application', async () => {
    const cancel = vi.fn<(...args: unknown[]) => void>()
    const contract = defineContract({ routes: { get: route.get('/', { responses: { 200: response.json() } }) } })
    const client = createClient(contract, {
      transport: fetchTransport({
        baseUrl: origin,
        fetch: () => new Response(new ReadableStream({ cancel }), { headers: { 'content-type': 'text/html' } }),
      }),
    })
    await expect(client.get()).rejects.toThrow('Expected response content type')
    expect(cancel).toHaveBeenCalledTimes(1)
  })

  test('keeps FormData and singleton/repeated query semantics consistent across transports', async () => {
    const tags = z
      .union([z.string(), z.array(z.string())])
      .transform((value) => (Array.isArray(value) ? value : [value]))
    const contract = defineContract({
      routes: { get: route.get('/', { query: z.object({ tags }), responses: { 200: response.formData() } }) },
    })
    const implementation = defineServer(contract).implement({
      get: ({ query }) => {
        const form = new FormData()
        for (const tag of query.tags) form.append('tag', tag)
        return { status: 200, body: form }
      },
    })
    for (const transport of [
      inProcessTransport(implementation),
      fetchTransport({ baseUrl: origin, fetch: fetchAdapter().mount(implementation) }),
    ]) {
      const client = createClient(contract, { transport })
      for (const values of [['one'], ['one', 'two']]) {
        expect((await client.get({ query: { tags: values } })).body.getAll('tag')).toEqual(values)
      }
    }
  })

  test('passes a portable signal and enforces a limit on actual streamed bytes', async () => {
    const contract = defineContract({
      routes: { post: route.post('/', { body: z.string(), responses: { 200: response.text() } }) },
    })
    const invoked = vi.fn<(...args: unknown[]) => void>()
    const implementation = defineServer(contract).implement({
      post: ({ signal }) => {
        invoked(signal)
        return { status: 200, body: 'ok' }
      },
    })
    const handler = fetchAdapter({ maxBodyBytes: 4 }).mount(implementation)
    const result = await handler(
      new Request(origin, {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: new ReadableStream({
          start(controller) {
            controller.enqueue(new TextEncoder().encode('"long"'))
            controller.close()
          },
        }),
        duplex: 'half',
      } as RequestInit)
    )
    expect(result.status).toBe(413)
    expect(invoked).not.toHaveBeenCalled()
  })

  test('constructs independent selected clients with endpoint names that match former controls', async () => {
    const contract = defineContract({
      routes: { users: router('/users', { routes: { use: route.get('/', { responses: { 200: response.text() } }) } }) },
    })
    const implementation = defineServer(contract).implement({ users: { use: () => ({ status: 200, body: 'ok' }) } })
    const base = createClient(contract, { transport: inProcessTransport(implementation) })
    const calls: string[] = []
    const branch = createClient(contract.routes.users, {
      transport: inProcessTransport(implementation),
      middleware: [
        ({ next }) => {
          calls.push('branch')
          return next()
        },
      ],
    })
    await base.users.use()
    await branch.use()
    expect(calls).toEqual(['branch'])
    await branch.use()
    expect(calls).toEqual(['branch', 'branch'])
    expect(Object.keys(base)).toEqual(['users'])
  })

  test('isolates concurrent request context, input and signal', async () => {
    const contract = defineContract({
      routes: { get: route.get('/:id', { params: z.object({ id: z.string() }), responses: { 200: response.text() } }) },
    })
    const implementation = defineServer(contract, { context: ({ signal }) => ({ signal, token: {} }) }).implement({
      get: async ({ params, signal, context }) => {
        await Promise.resolve()
        expect(signal).toBe(context.signal)
        return { status: 200, body: params.id }
      },
    })
    const client = createClient(contract, { transport: inProcessTransport(implementation) })
    const ids = Array.from({ length: 32 }, (_, index) => String(index))
    expect(
      (
        await Promise.all(ids.map((id) => client.get({ params: { id } }, { signal: new AbortController().signal })))
      ).map((result) => result.body)
    ).toEqual(ids)
  })
})

test('cancels a body already being read when concurrent header codec decoding fails', async () => {
  const cancel = vi.fn<(...args: unknown[]) => void>()
  const contract = defineContract({
    routes: {
      get: route.get('/', {
        responses: {
          200: response.json(z.any(), {
            headers: codec(z.object({ token: z.string() }), z.object({ token: z.string().refine(async () => false) }), {
              encode: (value) => value,
              decode: (value) => value,
            }),
          }),
        },
      }),
    },
  })
  const client = createClient(contract, {
    transport: fetchTransport({
      baseUrl: origin,
      fetch: () =>
        new Response(new ReadableStream({ cancel }), { headers: { 'content-type': 'application/json', token: 'bad' } }),
    }),
  })
  await expect(client.get()).rejects.toThrow(/./)
  expect(cancel).toHaveBeenCalledTimes(1)
})

test('preserves repeated Set-Cookie response headers across in-process and Fetch', async () => {
  const contract = defineContract({ routes: { get: route.get('/', { responses: { 200: response.text() } }) } })
  const implementation = defineServer(contract).implement({
    get: () => ({
      status: 200,
      body: 'ok',
      headers: { 'Set-Cookie': ['session=a; HttpOnly', 'theme=dark'], 'X-Name': 'test' },
    }),
  })
  for (const transport of [
    inProcessTransport(implementation),
    fetchTransport({ baseUrl: origin, fetch: fetchAdapter().mount(implementation) }),
  ]) {
    const result = await createClient(contract, { transport }).get()
    expect(result.headers['set-cookie']).toEqual(['session=a; HttpOnly', 'theme=dark'])
    expect(result.headers['x-name']).toBe('test')
  }
})

test.each(['opaque', 'formatted'] as const)(
  'cancels %s streams before the first pull and during a pending read',
  async (kind) => {
    const { ndjson } = await import('../src/stream')
    for (const start of [false, true]) {
      const cancel = vi.fn<() => void>()
      const native = new Response(new ReadableStream<Uint8Array>({ cancel }), {
        headers: { 'content-type': kind === 'formatted' ? 'application/x-ndjson' : 'application/octet-stream' },
      })
      const contract = defineContract({
        routes: {
          get: route.get('/', {
            responses: {
              200: kind === 'formatted' ? response.stream(ndjson(z.object({ ok: z.boolean() }))) : response.stream(),
            },
          }),
        },
      })
      const client = createClient(contract, { transport: fetchTransport({ baseUrl: origin, fetch: () => native }) })
      const result = await client.get()
      const iterator = result.body[Symbol.asyncIterator]()
      const pending = start ? iterator.next() : undefined
      await iterator.return?.()
      await pending
      await iterator.return?.()
      expect(cancel).toHaveBeenCalledTimes(1)
      expect(native.body!.locked).toBe(false)
    }
  }
)

test.each([200, 204] as const)('releases unread bodies on empty response status %s', async (status) => {
  const cancel = vi.fn<() => void>()
  const native = new Response(status === 200 ? new ReadableStream({ cancel }) : null, { status })
  const contract = defineContract({ routes: { get: route.get('/', { responses: { [status]: response.empty() } }) } })
  const client = createClient(contract, { transport: fetchTransport({ baseUrl: origin, fetch: () => native }) })
  expect(await client.get()).toEqual({ status, headers: {} })
  expect(cancel).toHaveBeenCalledTimes(status === 200 ? 1 : 0)
})

test('retains synchronous in-process stream iteration', async () => {
  const contract = defineContract({ routes: { get: route.get('/', { responses: { 200: response.stream() } }) } })
  const implementation = defineServer(contract).implement({ get: () => ({ status: 200, body: [new Uint8Array([1])] }) })
  const client = createClient(contract, { transport: inProcessTransport(implementation) })
  const chunks = []
  for await (const chunk of (await client.get()).body) chunks.push(chunk)
  expect(chunks).toEqual([new Uint8Array([1])])
  const iterator = (await client.get()).body[Symbol.asyncIterator]()
  await iterator.return?.()
  expect(await iterator.next()).toEqual({ done: true, value: undefined })
})
