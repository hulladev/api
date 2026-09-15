import { defineContract, response, route, router } from '@hulla/api'
import { inProcessTransport } from '@hulla/api/in-process'
import { defineServer } from '@hulla/api/server'
import type { ActionFunction, LoaderFunction } from 'react-router'
import { describe, expect, expectTypeOf, test, vi } from 'vitest'
import { z } from 'zod'
import { reactRouterAdapter, type ReactRouterContextInput, type ReactRouterServerErrorInput } from '../src'

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

type LoadContext = { readonly session: string }
type RouteParams = { readonly '*': string | undefined }

describe('React Router v7 integration', () => {
  test('creates loader and action functions compatible with a resource route', async () => {
    const implementation = defineServer(contract).implement({
      health: () => ({ status: 200, body: 'ok' }),
      users: {
        create: ({ body }) => ({ status: 201, body: { id: 'user-1', name: body.name } }),
      },
    })
    const handlers = reactRouterAdapter().mount(implementation)

    expectTypeOf(handlers.loader).toMatchTypeOf<LoaderFunction>()
    expectTypeOf(handlers.action).toMatchTypeOf<ActionFunction>()
    expect(Object.keys(handlers).sort()).toEqual(['action', 'loader'])

    const getResult = await handlers.loader({
      context: undefined,
      params: { '*': 'health' },
      request: new Request('https://example.com/api/health'),
    })
    expect(getResult.status).toBe(200)
    await expect(getResult.json()).resolves.toBe('ok')

    const postResult = await handlers.action({
      context: undefined,
      params: { '*': 'users' },
      request: new Request('https://example.com/api/users', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ name: 'Ada' }),
      }),
    })
    expect(postResult.status).toBe(201)
    await expect(postResult.json()).resolves.toEqual({ id: 'user-1', name: 'Ada' })
  })

  test('uses GET contract semantics and removes the body for HEAD requests', async () => {
    const implementation = defineServer(contract).implement({
      health: () => ({ status: 200, body: 'ok' }),
      users: {
        create: ({ body }) => ({ status: 201, body: { id: 'user-1', name: body.name } }),
      },
    })
    const handlers = reactRouterAdapter().mount(implementation)
    const result = await handlers.loader({
      context: undefined,
      params: { '*': 'health' },
      request: new Request('https://example.com/api/health', { method: 'HEAD' }),
    })

    expect(result.status).toBe(200)
    expect(result.body).toBeNull()
  })

  test('mounts implementation fragments while retaining resource-route method handling', async () => {
    const fragment = defineServer(contract).implement(contract.routes.health, () => ({ status: 200, body: 'ok' }))
    const handlers = reactRouterAdapter().mount(fragment)

    const getResult = await handlers.loader({
      context: undefined,
      params: { '*': 'health' },
      request: new Request('https://example.com/api/health'),
    })
    expect(getResult.status).toBe(200)

    const postResult = await handlers.action({
      context: undefined,
      params: { '*': 'users' },
      request: new Request('https://example.com/api/users', { method: 'POST' }),
    })
    expect(postResult.status).toBe(404)
  })

  test('exposes native load context and splat params without replacing contract route metadata', async () => {
    let contextInput: ReactRouterContextInput<typeof contract, LoadContext, RouteParams> | undefined
    const adapter = reactRouterAdapter<LoadContext, RouteParams>()
    const implementation = defineServer(contract, {
      context: adapter.context(({ request, route: routeMetadata, reactRouterContext, reactRouterParams }) => {
        contextInput = {
          request,
          route: routeMetadata,
          reactRouterContext,
          reactRouterParams,
        } as ReactRouterContextInput<typeof contract, LoadContext, RouteParams>
        return { session: reactRouterContext.session, splat: reactRouterParams['*'] }
      }),
    }).implement({
      health: ({ context }) => ({ status: 200, body: context.session === 'session-1' ? 'ok' : 'ok' }),
      users: {
        create: ({ body }) => ({ status: 201, body: { id: 'user-1', name: body.name } }),
      },
    })
    const handlers = adapter.mount(implementation)
    const request = new Request('https://example.com/api/health')

    await handlers.loader({ context: { session: 'session-1' }, params: { '*': 'health' }, request })

    expect(contextInput?.request).toBe(request)
    expect(contextInput?.reactRouterContext).toEqual({ session: 'session-1' })
    expect(contextInput?.reactRouterParams).toEqual({ '*': 'health' })
    expect(contextInput?.route).toEqual({ key: ['health'], method: 'GET', path: '/api/health' })
    expect(() => inProcessTransport(implementation as never)).toThrow(
      'Server requires the react-router adapter, but was mounted with in-process'
    )
  })

  test('forwards protocol-safe errors and native route state to the adapter error hook', async () => {
    const onError = vi.fn<(input: ReactRouterServerErrorInput<LoadContext, RouteParams>) => Response>(
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
    const handlers = reactRouterAdapter<LoadContext, RouteParams>({ onError }).mount(implementation)
    const request = new Request('https://example.com/api/health')
    const reactRouterContext = { session: 'session-1' }
    const reactRouterParams = { '*': 'health' }
    const result = await handlers.loader({ context: reactRouterContext, params: reactRouterParams, request })

    expect(result.status).toBe(500)
    await expect(result.json()).resolves.toEqual({ replaced: true })
    expect(onError).toHaveBeenCalledWith(
      expect.objectContaining({
        phase: 'handler',
        request,
        reactRouterContext,
        reactRouterParams,
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
    const invalidUsage = () => reactRouterAdapter().mount(implementation)

    expect(invalidUsage).toThrow('React Router resource routes do not support QUERY routes: search')
  })
})
