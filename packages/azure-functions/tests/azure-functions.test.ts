import { HttpRequest, InvocationContext, type HttpHandler } from '@azure/functions'
import { defineContract, request, response, route } from '@hulla/api'
import { inProcessTransport } from '@hulla/api/in-process'
import { defineServer } from '@hulla/api/server'
import { describe, expect, expectTypeOf, test, vi } from 'vitest'
import { z } from 'zod'
import { azureFunctionsAdapter, type AzureFunctionsContextInput, type AzureFunctionsServerErrorInput } from '../src'

const contract = defineContract({
  basePath: '/api',
  routes: {
    create: route.post('/items/:id', {
      params: z.object({ id: z.string() }),
      query: z.object({ tag: z.union([z.string(), z.array(z.string())]) }),
      body: request.json(z.object({ name: z.string() })),
      responses: {
        201: response.json(
          z.object({ id: z.string(), invocationId: z.string(), name: z.string(), tags: z.array(z.string()) })
        ),
      },
    }),
    events: route.get('/events', {
      responses: { 200: response.stream({ contentType: 'application/octet-stream' }) },
    }),
    fail: route.get('/fail', { responses: { 200: response.text() } }),
  },
})

function invocationContext(invocationId = 'invocation-1'): InvocationContext {
  return new InvocationContext({ functionName: 'hulla', invocationId })
}

describe('Azure Functions integration', () => {
  test('handles v4 HTTP requests with native context', async () => {
    let contextInput: AzureFunctionsContextInput<typeof contract> | undefined
    const adapter = azureFunctionsAdapter()
    const implementation = defineServer(contract, {
      context: adapter.context((input) => {
        expectTypeOf(input.request).toEqualTypeOf<HttpRequest>()
        expectTypeOf(input.invocationContext).toEqualTypeOf<InvocationContext>()
        contextInput = input as AzureFunctionsContextInput<typeof contract>
        return { invocationId: input.invocationContext.invocationId }
      }),
    }).implement({
      create: ({ body, context, params, query }) => ({
        status: 201,
        body: {
          id: params.id,
          invocationId: context.invocationId,
          name: body.name,
          tags: typeof query.tag === 'string' ? [query.tag] : [...query.tag],
        },
      }),
      events: () => ({ status: 200, body: (async function* () {})() }),
      fail: () => ({ status: 200, body: 'ok' }),
    })
    const handler = adapter.mount(implementation)
    const requestValue = new HttpRequest({
      method: 'POST',
      url: 'https://functions.example/api/items/item-1?tag=one&tag=two',
      headers: { 'content-type': 'application/json' },
      body: { string: JSON.stringify({ name: 'Ada' }) },
    })
    const context = invocationContext()

    expectTypeOf(handler).toEqualTypeOf<HttpHandler>()
    const result = await handler(requestValue, context)

    expect(result).toMatchObject({
      status: 201,
      headers: { 'content-type': 'application/json' },
      jsonBody: {
        id: 'item-1',
        invocationId: 'invocation-1',
        name: 'Ada',
        tags: ['one', 'two'],
      },
    })
    expect(contextInput?.request).toBe(requestValue)
    expect(contextInput?.invocationContext).toBe(context)
    expect(contextInput?.route).toEqual({ key: ['create'], method: 'POST', path: '/api/items/:id' })
    expect(() => inProcessTransport(implementation as never)).toThrow(
      'Server requires the azure-functions adapter, but was mounted with in-process'
    )
  })

  test('passes byte streams through without buffering', async () => {
    async function* events(): AsyncIterable<Uint8Array> {
      yield new Uint8Array([1, 2])
      yield new Uint8Array([3])
    }
    const implementation = defineServer(contract).implement({
      create: () => ({ status: 201, body: { id: '', invocationId: '', name: '', tags: [] } }),
      events: () => ({ status: 200, body: events() }),
      fail: () => ({ status: 200, body: 'ok' }),
    })
    const result = await azureFunctionsAdapter().mount(implementation)(
      new HttpRequest({ method: 'GET', url: 'https://functions.example/api/events' }),
      invocationContext()
    )
    const body = result.body as AsyncIterable<Uint8Array>
    const chunks: number[][] = []
    for await (const chunk of body) chunks.push([...chunk])

    expect(result).toMatchObject({
      status: 200,
      headers: { 'content-type': 'application/octet-stream' },
    })
    expect(chunks).toEqual([[1, 2], [3]])
  })

  test('forwards the request and invocation context to the error hook', async () => {
    const onError = vi.fn<(input: AzureFunctionsServerErrorInput) => void>()
    const implementation = defineServer(contract).implement({
      create: () => ({ status: 201, body: { id: '', invocationId: '', name: '', tags: [] } }),
      events: () => ({ status: 200, body: (async function* () {})() }),
      fail: (): { readonly body: string; readonly status: 200 } => {
        throw new Error('failure')
      },
    })
    const requestValue = new HttpRequest({ method: 'GET', url: 'https://functions.example/api/fail' })
    const context = invocationContext('failure-id')
    const result = await azureFunctionsAdapter().mount(implementation, {
      onError(input) {
        expectTypeOf(input).toEqualTypeOf<AzureFunctionsServerErrorInput>()
        onError(input)
        return { status: input.defaultResponse.status, body: input.invocationContext.invocationId }
      },
    })(requestValue, context)

    expect(result).toEqual({ status: 500, body: 'failure-id' })
    expect(onError).toHaveBeenCalledWith(
      expect.objectContaining({
        invocationContext: context,
        phase: 'handler',
        request: requestValue,
        route: { key: ['fail'], method: 'GET', path: '/api/fail' },
      })
    )
  })
})
