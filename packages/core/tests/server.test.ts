import { describe, expect, expectTypeOf, test } from 'vitest'
import { z } from 'zod'
import { defineContract, type Contract } from '../src/contract'
import { request } from '../src/request'
import { response } from '../src/response'
import { route } from '../src/route'
import { router } from '../src/router'
import {
  defineServer,
  type ServerContextFactory,
  type ServerHandlersOf,
  type ServerImplementation,
  type ServerMiddleware,
  type ServerResponseResult,
  type ServerRouteMetadata,
} from '../src/server'
import { createServerResponse } from '../src/server/response'
import { zodCodecFixture } from './zod-fixture'

const dateTime = zodCodecFixture(
  z.codec(z.iso.datetime(), z.date(), {
    decode: (value) => new Date(value),
    encode: (value) => value.toISOString(),
  })
)

const user = zodCodecFixture(z.object({ id: z.string(), organizationId: z.string(), createdAt: dateTime }))
const apiError = response.json(z.object({ code: z.enum(['CONFLICT', 'UNAUTHORIZED']), message: z.string().optional() }))

const contract = defineContract({
  basePath: '/api',
  errors: { 401: apiError },
  routes: {
    health: route.get('/health', { responses: { 200: response.text(z.literal('ok')) } }),
    organizations: router('/organizations/:organizationId', {
      params: z.object({ organizationId: z.string() }),
      routes: {
        listUsers: route.get('/users', {
          query: request.query(
            zodCodecFixture(
              z.object({ limit: z.codec(z.string(), z.number().int(), { decode: Number, encode: String }) })
            ),
            { repeated: [] }
          ),
          responses: { 200: response.json(zodCodecFixture(z.array(user))) },
        }),
        createUser: route.post('/users/:userId', {
          params: z.object({ userId: z.string() }),
          query: request.query(
            zodCodecFixture(
              z.object({
                notify: z.codec(z.enum(['true', 'false']), z.boolean(), {
                  decode: (value) => value === 'true',
                  encode: (value) => (value ? 'true' : 'false'),
                }),
              })
            ),
            { repeated: [] }
          ),
          headers: z.object({ 'x-actor-id': z.string() }),
          body: zodCodecFixture(z.object({ createdAt: dateTime })),
          responses: {
            201: response.json(user, { headers: z.object({ etag: z.string() }) }),
            409: apiError,
          },
        }),
      },
    }),
  },
})

function handlers() {
  return {
    health: () => ({ status: 200 as const, body: 'ok' as const }),
    organizations: {
      listUsers: () => ({ status: 200 as const, body: [] }),
      createUser: (input: {
        readonly params: { organizationId: string; userId: string }
        readonly query: { notify: boolean }
        readonly body: { createdAt: Date }
      }) =>
        input.query.notify
          ? {
              status: 201 as const,
              body: {
                id: input.params.userId,
                organizationId: input.params.organizationId,
                createdAt: input.body.createdAt,
              },
              headers: { etag: input.params.userId },
            }
          : { status: 409 as const, body: { code: 'CONFLICT' as const } },
    },
  }
}

describe('defineServer', () => {
  test('preserves literal paths in route metadata types', () => {
    type Metadata = ServerRouteMetadata<typeof contract>
    expectTypeOf<Extract<Metadata, { readonly key: readonly ['health'] }>>().toEqualTypeOf<{
      readonly key: readonly ['health']
      readonly method: 'GET'
      readonly path: '/api/health'
    }>()
    expectTypeOf<Extract<Metadata, { readonly key: readonly ['organizations', 'createUser'] }>>().toEqualTypeOf<{
      readonly key: readonly ['organizations', 'createUser']
      readonly method: 'POST'
      readonly path: '/api/organizations/:organizationId/users/:userId'
    }>()
  })

  test('infers context, input, metadata, and exact direct responses from one complete tree', () => {
    const server = defineServer(contract, {
      context: ({ request, route: metadata }) => ({
        requestId: request.headers.get('x-request-id') ?? metadata.key.join('.'),
      }),
    })
    const implementation = server.build({
      health(input) {
        expectTypeOf(input.context.requestId).toEqualTypeOf<string>()
        expectTypeOf(input.request.signal).toEqualTypeOf<AbortSignal>()
        expectTypeOf(input.route.path).toEqualTypeOf<'/api/health'>()
        return { status: 200, body: 'ok' }
      },
      organizations: {
        listUsers(input) {
          expectTypeOf(input.params.organizationId).toEqualTypeOf<string>()
          expectTypeOf(input.query.limit).toEqualTypeOf<number>()
          return { status: 200, body: [] }
        },
        createUser(input) {
          expectTypeOf(input.body.createdAt).toEqualTypeOf<Date>()
          expectTypeOf(input.params).toEqualTypeOf<{ organizationId: string } & { userId: string }>()
          expectTypeOf(input.query.notify).toEqualTypeOf<boolean>()
          expectTypeOf(input.headers['x-actor-id']).toEqualTypeOf<string>()
          return input.query.notify
            ? {
                status: 201,
                body: {
                  id: input.params.userId,
                  organizationId: input.params.organizationId,
                  createdAt: input.body.createdAt,
                },
                headers: { etag: input.params.userId },
              }
            : { status: 409, body: { code: 'CONFLICT' } }
        },
      },
    })

    expectTypeOf(server.context).toEqualTypeOf<
      ServerContextFactory<{ requestId: string }, typeof contract> | undefined
    >()
    expectTypeOf(implementation).toExtend<ServerImplementation<typeof contract, { requestId: string }>>()
    expect(implementation.contract).toBe(contract)
    expect(implementation.handlers.health).toBeTypeOf('function')
  })

  test('exports a type-only helper for ordinary handler module composition', () => {
    const server = defineServer(contract)
    type AppHandlers = ServerHandlersOf<typeof server>
    const health = { health: () => ({ status: 200, body: 'ok' }) } satisfies Pick<AppHandlers, 'health'>
    const organizations = { organizations: handlers().organizations } satisfies Pick<AppHandlers, 'organizations'>
    const implementation = server.build({ ...health, ...organizations })

    expect(implementation.handlers.health).toBe(health.health)
  })

  test('rejects invalid handler results at compile time', () => {
    const server = defineServer(contract)
    const valid = handlers()
    const extra = { status: 200 as const, body: 'ok' as const, debug: true }

    const invalidHandlers = () => {
      // @ts-expect-error A complete handler tree is required.
      server.build({ health: valid.health })
      server.build({
        ...valid,
        // @ts-expect-error Handler results cannot contain undeclared envelope fields.
        health: () => extra,
      })
      server.build({
        ...valid,
        // @ts-expect-error The response body must match its selected status.
        health: () => ({ status: 200, body: 'unhealthy' }),
      })
      server.build({
        ...valid,
        // @ts-expect-error The status must be declared by the route.
        health: () => ({ status: 201, body: 'ok' }),
      })
      server.build({
        ...valid,
        organizations: {
          ...valid.organizations,
          // @ts-expect-error The handler must cover both declared statuses.
          createUser: () => ({
            status: 201,
            body: { id: 'user-1', organizationId: 'organization-1', createdAt: new Date() },
            headers: { etag: 'user-1' },
          }),
        },
      })
    }

    expectTypeOf(invalidHandlers).toBeFunction()
  })

  test('checks complete, unknown, and invalid handler entries at the JavaScript boundary', () => {
    const build = defineServer(contract).build as unknown as (handlers: unknown) => unknown

    expect(() => build({ health: handlers().health })).toThrowError(
      expect.objectContaining({ code: 'missing-handler' })
    )
    expect(() => build({ ...handlers(), unknown: () => undefined })).toThrowError(
      expect.objectContaining({ code: 'unknown-handler', handlerKeys: ['unknown'] })
    )
    expect(() => build({ ...handlers(), health: 'invalid' })).toThrowError(
      expect.objectContaining({ code: 'invalid-handler', handlerKeys: ['health'] })
    )
  })

  test('types direct middleware errors and preserves a flat contract-scoped stack', async () => {
    const base = defineServer(contract, { context: () => ({ requestId: 'request-1' }) })
    const timing = base.middleware(async ({ context, next, route: metadata }) => {
      expectTypeOf(context.requestId).toEqualTypeOf<string>()
      expectTypeOf(metadata.path).toExtend<string>()
      return next()
    })
    const authenticate = base.middleware(async ({ next, response }) =>
      Math.random() > 0.5 ? next() : response(401, { code: 'UNAUTHORIZED' })
    )
    const server = base.use(timing, authenticate)
    const implementation = server.build(handlers())

    expectTypeOf(implementation.middlewares).toEqualTypeOf<
      readonly ServerMiddleware<{ requestId: string }, typeof contract>[]
    >()
    expect(implementation.middlewares).toEqual([timing, authenticate])
    await expect(
      implementation.middlewares[0]?.({
        context: { requestId: 'request-1' },
        next: async () => 'adapter-result',
        request: new Request('https://example.test'),
        response: createServerResponse,
        route: { key: ['health'], method: 'GET', path: '/api/health' },
      })
    ).resolves.toBe('adapter-result')
  })

  test('provides a complete generic boundary for backend adapters', () => {
    function defineTestAdapter<ContractType extends Contract, Context extends object>(
      server: ServerImplementation<ContractType, Context>
    ): ServerImplementation<ContractType, Context> {
      return server
    }

    const implementation = defineServer(contract).build(handlers())
    expect(defineTestAdapter(implementation)).toBe(implementation)
  })

  test('exports status-discriminated response result unions', () => {
    type Responses = typeof contract.routes.organizations.createUser.responses
    type Result = ServerResponseResult<Responses>
    type Created = Extract<Result, { readonly status: 201 }>
    type Conflict = Extract<Result, { readonly status: 409 }>

    expectTypeOf<Result['status']>().toEqualTypeOf<201 | 409>()
    expectTypeOf<Created['body']>().toEqualTypeOf<z.output<typeof user>>()
    expectTypeOf<Created['headers']>().toEqualTypeOf<{ etag: string }>()
    expectTypeOf<Conflict['body']>().toEqualTypeOf<{
      code: 'CONFLICT' | 'UNAUTHORIZED'
      message?: string
    }>()
  })

  test('preserves prototype-like and dotted handler keys safely', () => {
    const keyedContract = defineContract({
      routes: {
        ['__proto__']: route.get('/safe', { responses: { 200: response.text(z.literal('ok')) } }),
        'group.member': route.get('/flat', { responses: { 200: response.text() } }),
        group: router('/group', {
          routes: { member: route.get('/member', { responses: { 200: response.text() } }) },
        }),
      },
    })
    const implementation = defineServer(keyedContract).build({
      ['__proto__']: () => ({ status: 200, body: 'ok' }),
      'group.member': () => ({ status: 200, body: 'flat' }),
      group: { member: () => ({ status: 200, body: 'nested' }) },
    })

    expect(Object.keys(implementation.handlers)).toContain('__proto__')
    expect(implementation.handlers['group.member']).toBeTypeOf('function')
    expect(implementation.handlers.group.member).toBeTypeOf('function')
  })
})
