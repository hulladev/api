import { describe, expect, expectTypeOf, test } from 'vitest'
import { z } from 'zod'
import { defineContract } from '../src/contract'
import { defineErrors } from '../src/declared-errors'
import { response } from '../src/response'
import { route } from '../src/route'
import { defineServer, type ServerResponseResult } from '../src/server'

const sharedErrors = defineErrors({
  UNAUTHENTICATED: { message: 'Authentication required' },
  RATE_LIMITED: {
    message: 'Too many requests',
    data: z.object({ retryAfter: z.number() }),
  },
})
const contract = defineContract({
  errors: { 401: sharedErrors.UNAUTHENTICATED, 429: sharedErrors.RATE_LIMITED },
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
  test('supports middleware scope through the implementation flow', () => {
    const base = defineServer(contract, {
      context: ({ route: metadata }) => ({ requestId: metadata.key.join('.') }),
    })
    const timing = base.middleware(async ({ context, next, route: metadata }) => {
      expectTypeOf(context.requestId).toEqualTypeOf<string>()
      expectTypeOf(metadata.path).toEqualTypeOf<'/health' | '/profile'>()
      return next()
    })
    const authenticate = base.middleware(async ({ errors, next }) =>
      Math.random() > 0.5 ? next() : errors.UNAUTHENTICATED({ message: 'Sign in first' })
    )
    const rateLimit = base.middleware(({ errors, next }) =>
      Math.random() > 0.5 ? next() : errors.RATE_LIMITED({ data: { retryAfter: 30 } })
    )
    const server = base.use(timing).use(authenticate).use(rateLimit)
    const implementation = server.implement({
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
      base.middleware(async ({ errors, next }) =>
        // @ts-expect-error Error UNKNOWN is not declared by contract.errors.
        Math.random() > 0.5 ? next() : errors.UNKNOWN()
      )
      base.middleware(async ({ errors, next }) =>
        // @ts-expect-error RATE_LIMITED requires typed data.
        Math.random() > 0.5 ? next() : errors.RATE_LIMITED()
      )
      base.middleware(async ({ errors, next }) =>
        // @ts-expect-error retryAfter must be a number.
        Math.random() > 0.5 ? next() : errors.RATE_LIMITED({ data: { retryAfter: 'soon' } })
      )
    }

    expectTypeOf(invalidMiddleware).toBeFunction()
  })

  test('reports invalid middleware values at the JavaScript boundary', () => {
    const base = defineServer(contract, { context: () => ({ requestId: 'request-1' }) })
    const middleware = base.middleware as unknown as (value: unknown) => unknown
    const use = base.use as unknown as (...values: readonly unknown[]) => unknown

    expect(() => middleware({})).toThrowError('Server middleware must be a function')
    expect(() => use('invalid')).toThrowError('Server middleware must be a function')
  })
})
