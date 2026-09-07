import { MessageChannel } from 'node:worker_threads'
import { defineContract, request, response, route } from '@hulla/api'
import { defineClient } from '@hulla/api/client'
import { fetchAdapter, fetchTransport } from '@hulla/api/fetch'
import { inProcessTransport } from '@hulla/api/in-process'
import { defineServer } from '@hulla/api/server'
import { expect, test } from 'vitest'
import { z } from 'zod'
import { messagePortAdapter, messagePortTransport } from '../src'

test('preserves supported representations, encoded paths and repeated fields across transports', async () => {
  const contract = defineContract({
    routes: {
      json: route.post('/:id', {
        params: z.object({ id: z.string() }),
        query: z.object({ tag: z.union([z.string(), z.array(z.string())]) }),
        body: request.json(z.object({ text: z.string() })),
        responses: { 200: response.json() },
      }),
      bytes: route.post('/bytes', { body: request.bytes(), responses: { 200: response.bytes() } }),
      form: route.post('/form', { body: request.formData(), responses: { 200: response.formData() } }),
      stream: route.get('/stream', { responses: { 200: response.stream() } }),
    },
  })
  const implementation = defineServer(contract).implement({
    json: ({ params, query, body }) => ({ status: 200, body: { ...params, ...query, ...body } }),
    bytes: ({ body }) => ({ status: 200, body }),
    form: ({ body }) => ({ status: 200, body }),
    stream: () => ({
      status: 200,
      body: (async function* () {
        yield new Uint8Array([0, 255])
        yield new Uint8Array([1])
      })(),
    }),
  })
  const channel = new MessageChannel()
  const mounted = messagePortAdapter(channel.port1).mount(implementation)
  const ipc = messagePortTransport(channel.port2)
  try {
    await Promise.all([mounted.ready, ipc.ready])
    const transports = [
      inProcessTransport(implementation),
      fetchTransport({ baseUrl: 'http://conformance.test', fetch: fetchAdapter().mount(implementation) }),
      ipc,
    ]
    for (const transport of transports) {
      const client = defineClient(contract, { transport })
      for (const tag of [['one'], ['one', 'two']]) {
        const result = await client.json({
          params: { id: 'žluť/space ?#%' },
          query: { tag },
          body: { text: 'unicode ✓' },
        })
        expect(result.body).toEqual({ id: 'žluť/space ?#%', tag: tag.length === 1 ? 'one' : tag, text: 'unicode ✓' })
      }
      expect((await client.bytes({ body: new Uint8Array([0, 128, 255]) })).body).toEqual(new Uint8Array([0, 128, 255]))
      const form = new FormData()
      form.append('name', 'first')
      form.append('name', 'second')
      expect((await client.form({ body: form })).body.getAll('name')).toEqual(['first', 'second'])
      const chunks: number[] = []
      for await (const chunk of (await client.stream()).body) chunks.push(...chunk)
      expect(chunks).toEqual([0, 255, 1])
    }
  } finally {
    await ipc.close()
    await mounted.close()
    channel.port1.close()
    channel.port2.close()
  }
})
