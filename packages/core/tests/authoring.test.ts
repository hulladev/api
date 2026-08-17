import { describe, expect, expectTypeOf, test } from 'vitest'
import { z } from 'zod'
import { defineContract } from '../src/contract'
import { response } from '../src/response'
import { route } from '../src/route'
import { defineServer, type ServerResponseResult } from '../src/server'

const unauthorized = response.json(z.object({ code: z.literal('UNAUTHENTICATED'), message: z.string().optional() }))
const rateLimited = response.json(z.object({ code: z.literal('RATE_LIMITED'), retryAfter: z.number() }), {
  headers: z.object({ 'retry-after': z.string() }),
})
const contract = defineContract({
  errors: { 401: unauthorized, 429: rateLimited },
  routes: {
    health: route.get('/health', { responses: { 200: response.text(z.literal('ok')) } }),
    profile: route.get('/profile', {
      responses: {
        200: response.json(z.object({ id: z.string() })),
        404: response.json(z.object({ code: z.literal('PROFILE_NOT_FOUND') })),
      },
    }),
  },
})

describe('server authoring ergonomics', () => {
  test('supports symmetric middleware scope and build flow', () => {
    const base = defineServer(contract, {
      context: ({ request, route: metadata }) => ({
        requestId: request.headers.get('x-request-id') ?? metadata.key.join('.'),
      }),
    })
    const timing = base.middleware(async ({ context, next, route: metadata }) => {
      expectTypeOf(context.requestId).toEqualTypeOf<string>()
      expectTypeOf(metadata.path).toEqualTypeOf<'/health' | '/profile'>()
      return next()
    })
    const authenticate = base.middleware(async ({ next, response }) =>
      Math.random() > 0.5 ? next() : response(401, { code: 'UNAUTHENTICATED', message: 'Sign in first' })
    )
    const rateLimit = base.middleware(({ next, response }) =>
      Math.random() > 0.5 ? next() : response(429, { code: 'RATE_LIMITED', retryAfter: 30 }, { 'retry-after': '30' })
    )
    const server = base.use(timing, authenticate, rateLimit)
    const implementation = server.build({
      health: ({ response }) => response(200, 'ok'),
      profile: ({ context, response }) =>
        Math.random() > 0.5 ? response(200, { id: context.requestId }) : response(404, { code: 'PROFILE_NOT_FOUND' }),
    })

    expect(base.middlewares).toEqual([])
    expect(server.middlewares).toEqual([timing, authenticate, rateLimit])
    expect(implementation.middlewares).toEqual([timing, authenticate, rateLimit])
  })

  test('infers route failures separately from contract middleware errors', () => {
    type ProfileResult = ServerResponseResult<(typeof contract.routes.profile)['responses']>

    expectTypeOf<ProfileResult['status']>().toEqualTypeOf<200 | 404>()
    expectTypeOf<Extract<ProfileResult, { readonly status: 404 }>['body']>().toEqualTypeOf<{
      code: 'PROFILE_NOT_FOUND'
    }>()
    expectTypeOf<keyof typeof contract.errors>().toEqualTypeOf<401 | 429>()
  })

  test('rejects invalid direct middleware error combinations', () => {
    const base = defineServer(contract, { context: () => ({ requestId: 'request-1' }) })
    const invalidMiddleware = () => {
      base.middleware(async ({ next, response }) =>
        // @ts-expect-error Status 403 is not declared by contract.errors.
        Math.random() > 0.5 ? next() : response(403, { code: 'UNAUTHENTICATED' })
      )
      base.middleware(async ({ next, response }) =>
        // @ts-expect-error Status 401 selects the UNAUTHENTICATED body.
        Math.random() > 0.5 ? next() : response(401, { code: 'RATE_LIMITED', retryAfter: 30 })
      )
      base.middleware(async ({ next, response }) =>
        // @ts-expect-error The 429 response requires typed headers.
        Math.random() > 0.5 ? next() : response(429, { code: 'RATE_LIMITED', retryAfter: 30 })
      )
    }

    expectTypeOf(invalidMiddleware).toBeFunction()
  })

  test('reports invalid middleware values at the JavaScript boundary', () => {
    const base = defineServer(contract, { context: () => ({ requestId: 'request-1' }) })
    const middleware = base.middleware as unknown as (value: unknown) => unknown
    const use = base.use as unknown as (...values: readonly unknown[]) => unknown

    expect(() => middleware({})).toThrowError('Server middleware must be a function')
    expect(() => use(() => undefined, 'invalid')).toThrowError('Server middleware must be a function')
  })
})
