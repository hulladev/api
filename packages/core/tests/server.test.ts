import { describe, expect, expectTypeOf, test } from 'vitest'
import { z } from 'zod'
import { defineContract, type Contract } from '../src/contract'
import { defineErrors } from '../src/declared-errors'
import { response } from '../src/response'
import { route } from '../src/route'
import { router } from '../src/router'
import {
  defineServer,
  type ServerContextFactory,
  type ServerHandlersOf,
  type ServerImplementation,
  type ServerImplementationFragment,
  type ServerMiddleware,
  type ServerResponseResult,
  type ServerRouteMetadata,
} from '../src/server'

const dateTime = z.codec(z.iso.datetime(), z.date(), {
  decode: (value) => new Date(value),
  encode: (value) => value.toISOString(),
})

const user = z.object({ id: z.string(), organizationId: z.string(), createdAt: dateTime })
const apiError = response.json(z.object({ code: z.enum(['CONFLICT', 'UNAUTHORIZED']), message: z.string().optional() }))
const sharedErrors = defineErrors({ UNAUTHORIZED: { message: 'Authentication required' } })

const contract = defineContract({
  basePath: '/api',
  errors: { 401: sharedErrors.UNAUTHORIZED },
  routes: {
    health: route.get('/health', { responses: { 200: response.text(z.literal('ok')) } }),
    organizations: router('/organizations/:organizationId', {
      params: z.object({ organizationId: z.string() }),
      routes: {
        listUsers: route.get('/users', {
          query: z.object({ limit: z.codec(z.string(), z.number().int(), { decode: Number, encode: String }) }),
          responses: { 200: response.json(z.array(user)) },
        }),
        createUser: route.post('/users/:userId', {
          params: z.object({ userId: z.string() }),
          query: z.object({
            notify: z.codec(z.enum(['true', 'false']), z.boolean(), {
              decode: (value) => value === 'true',
              encode: (value) => (value ? 'true' : 'false'),
            }),
          }),
          headers: z.object({ 'x-actor-id': z.string() }),
          body: z.object({ createdAt: dateTime }),
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
                createdAt: input.body.createdAt.toISOString(),
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
      context: ({ route: metadata }) => ({ requestId: metadata.key.join('.') }),
    })
    const implementation = server.implement({
      health(input) {
        expectTypeOf(input.context.requestId).toEqualTypeOf<string>()
        expectTypeOf(input).not.toHaveProperty('request')
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
                  createdAt: input.body.createdAt.toISOString(),
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
    const implementation = server.implement({ ...health, ...organizations })

    expect(implementation.handlers.health).toBe(health.health)
  })

  test('creates typed implementation fragments and composes complete servers from them', () => {
    const server = defineServer(contract, { context: () => ({ requestId: 'request-1' }) })
    const health = server.implement(contract.routes.health, function health(input) {
      expectTypeOf(input.context.requestId).toEqualTypeOf<string>()
      expectTypeOf(input.route.key).toEqualTypeOf<readonly ['health']>()
      return { status: 200, body: 'ok' }
    })
    const organizations = server.implement(contract.routes.organizations, handlers().organizations)
    const implementation = server.implement(health, organizations)

    expectTypeOf(health).toExtend<
      ServerImplementationFragment<typeof contract, { requestId: string }, readonly ['health']>
    >()
    expect(implementation.handlers.health).toBe(health.handlers)
    expect(implementation.handlers.organizations.createUser).toBe(organizations.handlers.createUser)

    const invalidFragments = () => {
      // @ts-expect-error Fragment composition must cover every contract handler.
      server.implement(health)
      // @ts-expect-error Router implementation fragments must cover their selected node.
      server.implement(contract.routes.organizations, { listUsers: handlers().organizations.listUsers })
      // @ts-expect-error Contract nodes must come from the server contract.
      server.implement(route.get('/unknown', { responses: { 200: response.text() } }), handlers().health)
    }
    expectTypeOf(invalidFragments).toBeFunction()
  })

  test('rejects duplicate and foreign implementation fragments', () => {
    const server = defineServer(contract)
    const health = server.implement(contract.routes.health, handlers().health)
    const organizations = server.implement(contract.routes.organizations, handlers().organizations)
    const foreign = defineServer(contract).implement(contract.routes.health, handlers().health)

    expect(() => server.implement(health, health, organizations)).toThrowError(
      expect.objectContaining({ code: 'duplicate-handler', handlerKeys: ['health'] })
    )
    expect(() => server.implement(foreign, organizations)).toThrowError(
      expect.objectContaining({ code: 'foreign-implementation' })
    )
  })

  test('rejects mounting one declaration more than once', () => {
    const byId = route.get('/:id', {
      params: z.object({ id: z.string() }),
      responses: { 200: response.text() },
    })
    expect(() =>
      defineContract({
        routes: {
          users: router('/users', { routes: { byId } }),
          admins: router('/admins', { routes: { byId } }),
        },
      })
    ).toThrowError('Contract declaration "routes.admins.byId" is mounted more than once')
  })

  test('allows one declaration to be shared by independent contracts', () => {
    const shared = route.get('/shared', { responses: { 200: response.text() } })
    const first = defineContract({ routes: { first: shared } })
    const second = defineContract({ routes: { second: shared } })

    expect(first.routes.first).toBe(shared)
    expect(second.routes.second).toBe(shared)
  })

  test('rejects invalid handler results at compile time', () => {
    const server = defineServer(contract)
    const valid = handlers()
    const extra = { status: 200 as const, body: 'ok' as const, debug: true }

    const invalidHandlers = () => {
      // @ts-expect-error A complete handler tree is required.
      server.implement({ health: valid.health })
      server.implement({
        ...valid,
        // @ts-expect-error Handler results cannot contain undeclared envelope fields.
        health: () => extra,
      })
      // @ts-expect-error The response body must match its selected status.
      server.implement({
        ...valid,
        health: () => ({ status: 200, body: 'unhealthy' }),
      })
      // @ts-expect-error The status must be declared by the route.
      server.implement({
        ...valid,
        health: () => ({ status: 201, body: 'ok' }),
      })
      // @ts-expect-error The handler must cover both declared statuses.
      server.implement({
        ...valid,
        organizations: {
          ...valid.organizations,
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
    const server = defineServer(contract)
    const implement = server.implement as unknown as (...values: readonly unknown[]) => unknown

    expect(() => implement({ health: handlers().health })).toThrowError(
      expect.objectContaining({ code: 'missing-handler' })
    )
    expect(() => implement({ ...handlers(), unknown: () => undefined })).toThrowError(
      expect.objectContaining({ code: 'unknown-handler', handlerKeys: ['unknown'] })
    )
    expect(() => implement({ ...handlers(), health: 'invalid' })).toThrowError(
      expect.objectContaining({ code: 'invalid-handler', handlerKeys: ['health'] })
    )
    expect(() =>
      implement(route.get('/foreign', { responses: { 200: response.text() } }), handlers().health)
    ).toThrowError(expect.objectContaining({ code: 'foreign-contract-node' }))
  })

  test('rejects invalid definition options at the JavaScript boundary', () => {
    const define = defineServer as unknown as (contract: unknown, options: unknown) => unknown

    expect(() => define(contract, null)).toThrowError('Server options must be an object')
    expect(() => define(contract, { context: 'invalid' })).toThrowError('Server context must be a function')
  })

  test('types direct middleware errors and preserves a flat contract-scoped stack', async () => {
    const base = defineServer(contract, { context: () => ({ requestId: 'request-1' }) })
    const timing = base.middleware(async ({ context, next, route: metadata }) => {
      expectTypeOf(context.requestId).toEqualTypeOf<string>()
      expectTypeOf(metadata.path).toExtend<string>()
      return next()
    })
    const authenticate = base.middleware(async ({ errors, next }) =>
      Math.random() > 0.5 ? next() : errors.UNAUTHORIZED()
    )
    const server = base.use(timing).use(authenticate)
    const implementation = server.implement(handlers())

    expectTypeOf(implementation.middlewares).toEqualTypeOf<
      readonly ServerMiddleware<{ requestId: string }, typeof contract>[]
    >()
    expect(implementation.middlewares).toEqual([timing, authenticate])
    await expect(
      implementation.middlewares[0]?.({
        context: { requestId: 'request-1' },
        next: async () => 'adapter-result',
        errors: sharedErrors,
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

    const implementation = defineServer(contract).implement(handlers())
    expect(defineTestAdapter(implementation)).toBe(implementation)
  })

  test('exports status-discriminated response result unions', () => {
    type Responses = typeof contract.routes.organizations.createUser.responses
    type Result = ServerResponseResult<Responses>
    type Created = Extract<Result, { readonly status: 201 }>
    type Conflict = Extract<Result, { readonly status: 409 }>

    expectTypeOf<Result['status']>().toEqualTypeOf<201 | 409>()
    expectTypeOf<Created['body']>().toEqualTypeOf<z.input<typeof user>>()
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
    const implementation = defineServer(keyedContract).implement({
      ['__proto__']: () => ({ status: 200, body: 'ok' }),
      'group.member': () => ({ status: 200, body: 'flat' }),
      group: { member: () => ({ status: 200, body: 'nested' }) },
    })

    expect(Object.keys(implementation.handlers)).toContain('__proto__')
    expect(implementation.handlers['group.member']).toBeTypeOf('function')
    expect(implementation.handlers.group.member).toBeTypeOf('function')
  })
})
