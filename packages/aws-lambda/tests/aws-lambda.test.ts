import { defineContract, request, response, route } from '@hulla/api'
import { inProcessTransport } from '@hulla/api/in-process'
import { defineServer } from '@hulla/api/server'
import type { APIGatewayProxyEventV2, Context as LambdaContext } from 'aws-lambda'
import { describe, expect, expectTypeOf, test, vi } from 'vitest'
import { z } from 'zod'
import {
  awsLambdaAdapter,
  type AWSLambdaContextInput,
  type AWSLambdaHandler,
  type AWSLambdaServerErrorInput,
} from '../src'

const contract = defineContract({
  basePath: '/api',
  routes: {
    create: route.post('/items/:id', {
      params: z.object({ id: z.string() }),
      query: z.object({ tag: z.union([z.string(), z.array(z.string())]) }),
      headers: z.object({ cookie: z.string() }),
      body: request.json(z.object({ name: z.string() })),
      responses: {
        201: response.json(
          z.object({ id: z.string(), invocationId: z.string(), name: z.string(), tags: z.array(z.string()) })
        ),
      },
    }),
    bytes: route.get('/bytes', { responses: { 200: response.bytes() } }),
    fail: route.get('/fail', { responses: { 200: response.text() } }),
  },
})

function event(overrides: Partial<APIGatewayProxyEventV2> = {}): APIGatewayProxyEventV2 {
  return {
    version: '2.0',
    routeKey: '$default',
    rawPath: '/api/items/item-1',
    rawQueryString: 'tag=one&tag=two',
    cookies: ['session=secret', 'theme=dark'],
    headers: { 'content-type': 'application/json' },
    requestContext: {
      accountId: 'account',
      apiId: 'api',
      domainName: 'api.example.com',
      domainPrefix: 'api',
      http: {
        method: 'POST',
        path: '/api/items/item-1',
        protocol: 'HTTP/1.1',
        sourceIp: '127.0.0.1',
        userAgent: 'vitest',
      },
      requestId: 'request-1',
      routeKey: '$default',
      stage: '$default',
      time: '25/Aug/2026:00:00:00 +0000',
      timeEpoch: 0,
    },
    body: JSON.stringify({ name: 'Ada' }),
    isBase64Encoded: false,
    ...overrides,
  }
}

function lambdaContext(invocationId = 'invocation-1'): LambdaContext {
  return { awsRequestId: invocationId } as LambdaContext
}

describe('AWS Lambda integration', () => {
  test('handles HTTP API v2 events with native context', async () => {
    let contextInput: AWSLambdaContextInput<typeof contract> | undefined
    const adapter = awsLambdaAdapter()
    const implementation = defineServer(contract, {
      context: adapter.context((input) => {
        expectTypeOf(input.event).toEqualTypeOf<APIGatewayProxyEventV2>()
        expectTypeOf(input.lambdaContext).toEqualTypeOf<LambdaContext>()
        contextInput = input as AWSLambdaContextInput<typeof contract>
        return { invocationId: input.lambdaContext.awsRequestId }
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
      bytes: () => ({ status: 200, body: new Uint8Array([0, 127, 255]) }),
      fail: () => ({ status: 200, body: 'ok' }),
    })
    const handler = adapter.mount(implementation)
    const input = event()
    const context = lambdaContext()

    expectTypeOf(handler).toEqualTypeOf<AWSLambdaHandler>()
    const result = await handler(input, context)

    expect(result).toMatchObject({
      statusCode: 201,
      headers: { 'content-type': 'application/json' },
      isBase64Encoded: false,
    })
    expect(JSON.parse(result.body ?? '')).toEqual({
      id: 'item-1',
      invocationId: 'invocation-1',
      name: 'Ada',
      tags: ['one', 'two'],
    })
    expect(contextInput?.event).toBe(input)
    expect(contextInput?.lambdaContext).toBe(context)
    expect(contextInput?.route).toEqual({ key: ['create'], method: 'POST', path: '/api/items/:id' })
    expect(() => inProcessTransport(implementation as never)).toThrow(
      'Server requires the aws-lambda adapter, but was mounted with in-process'
    )
  })

  test('base64-encodes byte responses', async () => {
    const implementation = defineServer(contract).implement({
      create: () => ({
        status: 201,
        body: { id: '', invocationId: '', name: '', tags: [] },
      }),
      bytes: () => ({ status: 200, body: new Uint8Array([0, 127, 255]) }),
      fail: () => ({ status: 200, body: 'ok' }),
    })
    const result = await awsLambdaAdapter().mount(implementation)(
      event({
        rawPath: '/api/bytes',
        rawQueryString: '',
        requestContext: { ...event().requestContext, http: { ...event().requestContext.http, method: 'GET' } },
        body: '',
      }),
      lambdaContext()
    )

    expect(result).toMatchObject({
      statusCode: 200,
      body: 'AH//',
      isBase64Encoded: true,
      headers: { 'content-type': 'application/octet-stream' },
    })
  })

  test('forwards native invocation state to the error hook', async () => {
    const onError = vi.fn<(input: AWSLambdaServerErrorInput) => void>()
    const implementation = defineServer(contract).implement({
      create: () => ({
        status: 201,
        body: { id: '', invocationId: '', name: '', tags: [] },
      }),
      bytes: () => ({ status: 200, body: new Uint8Array() }),
      fail: (): { readonly body: string; readonly status: 200 } => {
        throw new Error('failure')
      },
    })
    const input = event({
      rawPath: '/internal/fail',
      rawQueryString: '',
      requestContext: { ...event().requestContext, http: { ...event().requestContext.http, method: 'GET' } },
      body: '',
    })
    const context = lambdaContext('failure-id')
    const result = await awsLambdaAdapter().mount(implementation, {
      pathname: ({ rawPath }) => rawPath.replace('/internal', '/api'),
      onError(errorInput) {
        expectTypeOf(errorInput).toEqualTypeOf<AWSLambdaServerErrorInput>()
        onError(errorInput)
        return { statusCode: errorInput.defaultResponse.statusCode, body: errorInput.lambdaContext.awsRequestId }
      },
    })(input, context)

    expect(result).toEqual({ statusCode: 500, body: 'failure-id' })
    expect(onError).toHaveBeenCalledWith(
      expect.objectContaining({
        event: input,
        lambdaContext: context,
        phase: 'handler',
        route: { key: ['fail'], method: 'GET', path: '/api/fail' },
      })
    )
  })
})
