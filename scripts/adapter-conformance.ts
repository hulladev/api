import { defineContract, defineErrors, request, response, route } from '@hulla/api'
import { defineClient, type ClientTransport } from '@hulla/api/client'
import { defineServer } from '@hulla/api/server'
import { afterEach, beforeEach, describe, expect, test } from 'vitest'
import { z } from 'zod'

const errors = defineErrors({ MISSING: { message: 'Missing item', data: z.object({ id: z.string() }) } })
const contract = defineContract({
  errors: { 404: errors.MISSING },
  routes: {
    echo: route.post('/echo/:id', {
      params: z.object({ id: z.string() }),
      query: z.object({ tag: z.union([z.string(), z.array(z.string())]) }),
      body: request.json(z.object({ text: z.string() })),
      responses: { 200: response.json() },
    }),
    text: route.post('/text', { body: request.text(), responses: { 200: response.text() } }),
    bytes: route.post('/bytes', { body: request.bytes(), responses: { 200: response.bytes() } }),
    form: route.post('/form', { body: request.formData(), responses: { 200: response.formData() } }),
    empty: route.get('/empty', { responses: { 204: response.empty() } }),
    cookies: route.get('/cookies', { responses: { 200: response.text() } }),
    missing: route.get('/missing', { responses: { 200: response.text() } }),
    wait: route.get('/wait', { responses: { 200: response.text() } }),
    brokenStream: route.get('/broken-stream', { responses: { 200: response.stream() } }),
    stream: route.get('/stream', { responses: { 200: response.stream() } }),
  },
})

function fixture() {
  const state = {
    calls: 0,
    contexts: 0,
    finalized: 0,
    trace: [] as string[],
    signal: undefined as AbortSignal | undefined,
  }
  const implementation = defineServer(contract, {
    context: () => ({ sequence: ++state.contexts }),
  })
    .use(async ({ next }) => {
      state.trace.push('before')
      const result = await next()
      state.trace.push('after')
      return result
    })
    .implement({
      echo: ({ params, query, body, context }) => {
        state.calls++
        state.trace.push('handler')
        return { status: 200, body: { ...params, ...query, ...body, sequence: context.sequence } }
      },
      text: ({ body }) => ({ status: 200, body }),
      bytes: ({ body }) => ({ status: 200, body }),
      form: ({ body }) => ({ status: 200, body }),
      empty: () => ({ status: 204 }),
      cookies: () => ({ status: 200, body: 'ok', headers: { 'set-cookie': ['a=1; Path=/', 'b=2; Path=/'] } }),
      missing: ({ errors }) => {
        throw errors.MISSING({ data: { id: 'absent' } })
      },
      wait: async ({ signal }) => {
        state.signal = signal
        await new Promise<void>((resolve) => {
          if (signal.aborted) resolve()
          else signal.addEventListener('abort', () => resolve(), { once: true })
        })
        signal.throwIfAborted()
        return { status: 200, body: 'unreachable' }
      },
      brokenStream: () => ({
        status: 200,
        body: (async function* () {
          try {
            yield new Uint8Array(256 * 1024)
            throw new Error('producer failed')
          } finally {
            state.finalized++
          }
        })(),
      }),
      stream: () => ({
        status: 200,
        body: (async function* () {
          try {
            // Yield without waiting so both pull-driven and buffered HTTP writers can close.
            for (let index = 0; index < 256; index++) yield new Uint8Array(16 * 1024).fill(index % 256)
          } finally {
            state.finalized++
          }
        })(),
      }),
    })
  return { implementation, state }
}

type Support = true | string
export type ConformanceHost = {
  readonly transport: ClientTransport
  readonly close: () => void | Promise<void>
  readonly http?: (request: Request) => Promise<Response>
}
export type ConformanceOptions = {
  readonly name: string
  /** Use true or a concrete explanation of host ownership/unsupported behavior. */
  readonly encodedSlash?: { readonly value: string; readonly reason: string }
  readonly formData: Support
  readonly cancellation: Support
  readonly malformedJson: Support
  readonly open: (
    implementation: ReturnType<typeof fixture>['implementation']
  ) => ConformanceHost | Promise<ConformanceHost>
}

/** Shared contract laws; native routing/context and platform lifecycle tests stay with each adapter. */
export function adapterConformance(options: ConformanceOptions): void {
  describe(`${options.name} shared conformance`, () => {
    let current: ReturnType<typeof fixture>
    let host: ConformanceHost
    beforeEach(async () => {
      current = fixture()
      host = await options.open(current.implementation)
    })
    afterEach(async () => {
      await host?.close()
    })
    const client = () => defineClient(contract, { transport: host.transport })
    /* oxlint-disable vitest/expect-expect, vitest/no-conditional-tests, vitest/valid-title, vitest/no-disabled-tests -- The shared registrar receives assertions and reports explicit host capability exclusions. */
    const supported = (name: string, support: Support, run: () => Promise<void>) => {
      if (support === true) test(name, run)
      else test.skip(`${name} — ${support}`, run)
    }

    /* oxlint-enable vitest/expect-expect, vitest/no-conditional-tests, vitest/valid-title, vitest/no-disabled-tests */

    test('preserves encoded paths, singleton/repeated query fields, context isolation and middleware order', async () => {
      for (const [index, tag] of [['one'], ['one', 'two']].entries()) {
        const result = await client().echo({
          params: { id: 'žluť/space ?#%' },
          query: { tag },
          body: { text: 'unicode ✓' },
        })
        expect(result).toMatchObject({
          status: 200,
          body: {
            id: `žluť${options.encodedSlash?.value ?? '/'}space ?#%`,
            tag: tag.length === 1 ? 'one' : tag,
            text: 'unicode ✓',
            sequence: index + 1,
          },
        })
      }
      expect(current.state.trace).toEqual(['before', 'handler', 'after', 'before', 'handler', 'after'])
      expect(current.state.calls).toBe(2)
    })
    test('preserves text, binary bytes and bodyless statuses', async () => {
      expect(await client().text({ body: 'héllo\nworld' })).toMatchObject({ status: 200, body: 'héllo\nworld' })
      expect(await client().bytes({ body: new Uint8Array([0, 128, 255]) })).toMatchObject({
        status: 200,
        body: new Uint8Array([0, 128, 255]),
      })
      expect(await client().empty()).toMatchObject({ status: 204 })
      expect((await client().empty()).body).toBeUndefined()
    })
    supported('preserves multipart repeated fields and file bytes', options.formData, async () => {
      const form = new FormData()
      form.append('name', 'first')
      form.append('name', 'second')
      form.append('file', new Blob([new Uint8Array([0, 255])], { type: 'application/octet-stream' }), 'sample.bin')
      const result = await client().form({ body: form })
      if (result.status !== 200) throw new Error('Expected multipart success')
      expect(result.body.getAll('name')).toEqual(['first', 'second'])
      const file = result.body.get('file') as File
      expect(file.name).toBe('sample.bin')
      expect(new Uint8Array(await file.arrayBuffer())).toEqual(new Uint8Array([0, 255]))
    })
    test('keeps Set-Cookie values separate', async () => {
      expect((await client().cookies()).headers['set-cookie']).toEqual(['a=1; Path=/', 'b=2; Path=/'])
    })
    test('roundtrips declared errors in return and throw modes', async () => {
      expect(await client().missing()).toMatchObject({
        status: 404,
        body: { code: 'MISSING', message: 'Missing item', data: { id: 'absent' } },
      })
      const throwing = defineClient(contract, { transport: host.transport, errorMode: 'throw' })
      await expect(throwing.missing()).rejects.toMatchObject({ code: 'MISSING', data: { id: 'absent' } })
    })
    supported('rejects malformed JSON before invoking the handler and recovers', options.malformedJson, async () => {
      if (!host.http) throw new Error('malformedJson requires an HTTP request function')
      const result = await host.http(
        new Request('http://conformance.test/echo/id?tag=one', {
          method: 'POST',
          headers: { 'content-type': 'application/json' },
          body: '{',
        })
      )
      expect(result.status).toBe(400)
      await result.arrayBuffer()
      expect(current.state.calls).toBe(0)
      expect(await client().echo({ params: { id: 'ok' }, query: { tag: 'one' }, body: { text: 'ok' } })).toMatchObject({
        status: 200,
      })
    })
    supported('propagates cancellation to cooperative handler work', options.cancellation, async () => {
      const controller = new AbortController()
      // Observe rejection immediately, including while waiting for the server signal.
      const pending = client()
        .wait({ signal: controller.signal })
        .then(
          () => 'resolved',
          () => 'rejected'
        )
      try {
        await expect.poll(() => current.state.signal, { timeout: 2000 }).toBeDefined()
        controller.abort(new Error('conformance cancellation'))
        await expect.poll(() => current.state.signal?.aborted, { timeout: 2000 }).toBe(true)
        expect(await pending).toBe('rejected')
      } finally {
        controller.abort()
      }
    })
    test('exhausts a response stream and closes its producer', async () => {
      const result = await client().stream()
      if (result.status !== 200) throw new Error('Expected stream success')
      let length = 0
      for await (const chunk of result.body) {
        expect(chunk).toBeInstanceOf(Uint8Array)
        length += chunk.length
      }
      expect(length).toBe(256 * 16 * 1024)
      await expect.poll(() => current.state.finalized).toBe(1)
    })
    test('reports a failing stream and finalizes its producer', async () => {
      const consume = async () => {
        const result = await client().brokenStream()
        if (result.status !== 200) throw new Error('Expected stream success')
        for await (const chunk of result.body) expect(chunk).toBeInstanceOf(Uint8Array)
      }
      await expect(consume()).rejects.toBeInstanceOf(Error)
      await expect.poll(() => current.state.finalized).toBe(1)
    })
    test('closes a response producer when its consumer returns early', async () => {
      const result = await client().stream()
      if (result.status !== 200) throw new Error('Expected stream success')
      for await (const chunk of result.body) {
        expect(chunk.length).toBeGreaterThan(0)
        break
      }
      await expect.poll(() => current.state.finalized).toBe(1)
    })
  })
}
