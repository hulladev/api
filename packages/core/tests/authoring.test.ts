import { describe, expect, expectTypeOf, test } from 'vitest'
import { z } from 'zod'
import { defineContract } from '../src/contract'
import { response } from '../src/response'
import { route } from '../src/route'
import { defineServer, type ServerDefinition, type ServerMiddleware, type ServerResponseResult } from '../src/server'

const unauthorized = response.json(
  z.object({
    code: z.literal('UNAUTHENTICATED'),
    message: z.string().optional(),
  })
)

const rateLimited = response.json(z.object({ code: z.literal('RATE_LIMITED'), retryAfter: z.number() }), {
  headers: z.object({ 'retry-after': z.string() }),
})

const contract = defineContract({
  errors: {
    401: unauthorized,
    429: rateLimited,
  },
  routes: {
    health: route.get('/health', {
      responses: { 200: response.text(z.literal('ok')) },
    }),
    profile: route.get('/profile', {
      responses: {
        200: response.json(z.object({ id: z.string() })),
        404: response.json(z.object({ code: z.literal('PROFILE_NOT_FOUND') })),
      },
    }),
  },
})

type MiddlewareStatuses<Value> =
  Value extends ServerDefinition<typeof contract, { requestId: string }, infer Status> ? Status : never

describe('server authoring ergonomics', () => {
  test('supports the common base, middleware, scoped server, fragment, and build flow', () => {
    const base = defineServer(contract, {
      context: ({ request, route: metadata }) => ({
        requestId: request.headers.get('x-request-id') ?? metadata.key.join('.'),
      }),
    })
    const timing = base.middleware(async (actions, args) => {
      expectTypeOf(args.context.requestId).toEqualTypeOf<string>()
      expectTypeOf(args.route.path).toEqualTypeOf<'/health' | '/profile'>()
      return actions.next()
    })
    const authenticate = base.middleware(async (actions) =>
      Math.random() > 0.5
        ? actions.next()
        : actions.error(401, {
            body: { code: 'UNAUTHENTICATED', message: 'Sign in first' },
          })
    )
    const rateLimit = base.middleware((actions) =>
      Math.random() > 0.5
        ? actions.next()
        : actions.error(429, {
            body: { code: 'RATE_LIMITED', retryAfter: 30 },
            headers: { 'retry-after': '30' },
          })
    )
    const publicServer = base.use(timing)
    const protectedServer = publicServer.use(authenticate, rateLimit)

    const healthHandlers = publicServer.implement({
      health: (actions) => actions.respond({ status: 200, body: 'ok' }),
    })
    const profileHandlers = protectedServer.implement({
      profile: (actions, args) =>
        Math.random() > 0.5
          ? actions.respond({ status: 200, body: { id: args.context.requestId } })
          : actions.respond({ status: 404, body: { code: 'PROFILE_NOT_FOUND' } }),
    })
    const implementation = base.build(healthHandlers, profileHandlers)

    expectTypeOf<MiddlewareStatuses<typeof publicServer>>().toEqualTypeOf<never>()
    expectTypeOf<MiddlewareStatuses<typeof protectedServer>>().toEqualTypeOf<401 | 429>()
    expectTypeOf(implementation.middlewares.health).toEqualTypeOf<
      readonly ServerMiddleware<{ requestId: string }, typeof contract, never>[]
    >()
    expectTypeOf(implementation.middlewares.profile).toEqualTypeOf<
      readonly ServerMiddleware<{ requestId: string }, typeof contract, 401 | 429>[]
    >()

    expect(base.middlewares).toEqual([])
    expect(publicServer.middlewares).toEqual([timing])
    expect(protectedServer.middlewares).toEqual([timing, authenticate, rateLimit])
    expect(implementation.middlewares.health).toEqual([timing])
    expect(implementation.middlewares.profile).toEqual([timing, authenticate, rateLimit])
  })

  test('infers each contract error body and headers from its status', () => {
    const base = defineServer(contract, { context: () => ({ requestId: 'request-1' }) })

    const invalidMiddleware = () => {
      base.middleware((actions) =>
        // @ts-expect-error Status 403 is not declared by contract.errors.
        actions.error(403, { body: { code: 'UNAUTHENTICATED' } })
      )
      base.middleware((actions) =>
        // @ts-expect-error Status 401 selects the UNAUTHENTICATED body.
        actions.error(401, { body: { code: 'RATE_LIMITED', retryAfter: 30 } })
      )
      base.middleware((actions) =>
        // @ts-expect-error The 429 response declares required response headers.
        actions.error(429, { body: { code: 'RATE_LIMITED', retryAfter: 30 } })
      )
      base.middleware((actions) =>
        actions.error(429, {
          body: { code: 'RATE_LIMITED', retryAfter: 30 },
          headers: { 'retry-after': '30' },
          // @ts-expect-error Error results reject undeclared fields at the call site.
          debug: true,
        })
      )
    }

    expectTypeOf(invalidMiddleware).toBeFunction()
  })

  test('keeps route failure responses separate from middleware errors', () => {
    type ProfileResult = ServerResponseResult<(typeof contract.routes.profile)['responses']>

    expectTypeOf<ProfileResult['status']>().toEqualTypeOf<200 | 404>()
    expectTypeOf<Extract<ProfileResult, { readonly status: 404 }>['body']>().toEqualTypeOf<{
      code: 'PROFILE_NOT_FOUND'
    }>()
    expectTypeOf<keyof typeof contract.errors>().toEqualTypeOf<401 | 429>()
  })

  test('omits the error action when a contract has no middleware errors', () => {
    const publicContract = defineContract({
      routes: {
        health: route.get('/health', { responses: { 200: response.text() } }),
      },
    })
    const base = defineServer(publicContract)

    const invalidMiddleware = () =>
      base.middleware((actions) => {
        // @ts-expect-error Contracts without errors do not expose actions.error().
        return actions.error(401, { body: { code: 'UNAUTHENTICATED' } })
      })

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
