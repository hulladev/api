import { defineContract, response, route, router } from '@hulla/api'
import { inProcessTransport } from '@hulla/api/in-process'
import { defineServer } from '@hulla/api/server'
import { createFileRoute } from '@tanstack/react-router'
import type {} from '@tanstack/react-start'
import { describe, expect, expectTypeOf, test, vi } from 'vitest'
import { z } from 'zod'
import {
  createServerRouteHandlers,
  tanStackStartContext,
  type TanStackStartContextInput,
  type TanStackStartHandlerInput,
  type TanStackStartServerErrorInput,
} from '../src'

const contract = defineContract({
  basePath: '/api',
  routes: {
    health: route.get('/health', { responses: { 200: response.json(z.literal('ok')) } }),
    users: router('/users', {
      routes: {
        create: route.post('/', {
          body: z.object({ name: z.string() }),
          responses: { 201: response.json(z.object({ id: z.string(), name: z.string() })) },
        }),
      },
    }),
  },
})

type StartContext = { readonly session: string }
type StartParams = { readonly _splat: string | undefined }

describe('TanStack Start integration', () => {
  test('creates a contract-derived handler map compatible with a Start file route', async () => {
    const implementation = defineServer(contract).implement({
      health: () => ({ status: 200, body: 'ok' }),
      users: {
        create: ({ body }) => ({ status: 201, body: { id: 'user-1', name: body.name } }),
      },
    })
    const handlers = createServerRouteHandlers(implementation)

    expectTypeOf(handlers.GET).toEqualTypeOf<((input: TanStackStartHandlerInput) => Promise<Response>) | undefined>()
    expect(Object.keys(handlers).sort()).toEqual(['GET', 'POST'])

    const fileRoute = createFileRoute('/api/$' as never)({ server: { handlers } })
    expect(fileRoute.options.server?.handlers).toBe(handlers)

    const getResult = await handlers.GET!({
      context: undefined,
      params: { _splat: 'health' },
      request: new Request('https://example.com/api/health'),
    })
    expect(getResult.status).toBe(200)
    await expect(getResult.json()).resolves.toBe('ok')

    const postResult = await handlers.POST!({
      context: undefined,
      params: { _splat: 'users' },
      request: new Request('https://example.com/api/users', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ name: 'Ada' }),
      }),
    })
    expect(postResult.status).toBe(201)
    await expect(postResult.json()).resolves.toEqual({ id: 'user-1', name: 'Ada' })
  })

  test('mounts an implementation fragment without retaining unrelated methods', async () => {
    const fragment = defineServer(contract).implement(contract.routes.health, () => ({ status: 200, body: 'ok' }))
    const handlers = createServerRouteHandlers(fragment)

    expect(Object.keys(handlers)).toEqual(['GET'])
    expect(handlers.POST).toBeUndefined()

    const result = await handlers.GET!({
      context: undefined,
      params: { _splat: 'health' },
      request: new Request('https://example.com/api/health'),
    })
    expect(result.status).toBe(200)
    await expect(result.json()).resolves.toBe('ok')
  })

  test('exposes native Start state without replacing contract route metadata', async () => {
    let contextInput: TanStackStartContextInput<typeof contract, StartContext, StartParams> | undefined
    const implementation = defineServer(contract, {
      context: tanStackStartContext<StartContext, StartParams>()(
        ({ request, route: routeMetadata, startContext, startParams }) => {
          contextInput = {
            request,
            route: routeMetadata,
            startContext,
            startParams,
          } as TanStackStartContextInput<typeof contract, StartContext, StartParams>
          return { session: startContext.session, splat: startParams._splat }
        }
      ),
    }).implement({
      health: ({ context }) => ({ status: 200, body: context.session === 'session-1' ? 'ok' : 'ok' }),
      users: {
        create: ({ body }) => ({ status: 201, body: { id: 'user-1', name: body.name } }),
      },
    })
    const handlers = createServerRouteHandlers(implementation)
    const request = new Request('https://example.com/api/health')

    await handlers.GET!({ context: { session: 'session-1' }, params: { _splat: 'health' }, request })

    expect(contextInput?.request).toBe(request)
    expect(contextInput?.startContext).toEqual({ session: 'session-1' })
    expect(contextInput?.startParams).toEqual({ _splat: 'health' })
    expect(contextInput?.route).toEqual({ key: ['health'], method: 'GET', path: '/api/health' })
    expect(() => inProcessTransport(implementation as never)).toThrow(
      'Server requires the tanstack-start adapter, but was mounted with in-process'
    )
  })

  test('forwards protocol-safe errors to the adapter error hook', async () => {
    const onError = vi.fn<(input: TanStackStartServerErrorInput<StartContext, StartParams>) => Response>(
      ({ defaultResponse }) => Response.json({ replaced: true }, { status: defaultResponse.status })
    )
    const implementation = defineServer(contract).implement({
      health: (): { readonly body: 'ok'; readonly status: 200 } => {
        throw new Error('failure')
      },
      users: {
        create: ({ body }) => ({ status: 201, body: { id: 'user-1', name: body.name } }),
      },
    })
    const handlers = createServerRouteHandlers(implementation, { onError })
    const request = new Request('https://example.com/api/health')
    const startContext = { session: 'session-1' }
    const startParams = { _splat: 'health' }
    const result = await handlers.GET!({ context: startContext, params: startParams, request })

    expect(result.status).toBe(500)
    await expect(result.json()).resolves.toEqual({ replaced: true })
    expect(onError).toHaveBeenCalledWith(
      expect.objectContaining({
        phase: 'handler',
        request,
        startContext,
        startParams,
        route: expect.objectContaining({ key: ['health'] }),
      })
    )
  })

  test('rejects QUERY routes during adapter creation', () => {
    const queryContract = defineContract({
      routes: { search: route.query('/search', { responses: { 200: response.json(z.string()) } }) },
    })
    const implementation = defineServer(queryContract).implement({
      search: () => ({ status: 200, body: 'result' }),
    })
    const invalidUsage = () => createServerRouteHandlers(implementation)

    expect(invalidUsage).toThrow('TanStack Start server routes do not support QUERY routes: search')
  })
})
