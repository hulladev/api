import { describe, expect, expectTypeOf, test } from 'vitest'
import { z } from 'zod'
import { defineContract, type Contract } from '../src/contract'
import { response } from '../src/response'
import { route } from '../src/route'
import { router } from '../src/router'
import {
  defineServer,
  ServerImplementationError,
  type ServerContextFactory,
  type ServerDefinition,
  type ServerImplementation,
  type ServerMiddleware,
  type ServerResponseResult,
  type ServerRouteMetadata,
} from '../src/server'
import { text } from '../src/zod'

const dateTime = z.codec(z.iso.datetime(), z.date(), {
  decode: (value) => new Date(value),
  encode: (value) => value.toISOString(),
})

const user = z.object({
  id: z.string(),
  organizationId: z.string(),
  createdAt: dateTime,
})

const apiError = response.json(
  z.object({
    code: z.enum(['CONFLICT', 'UNAUTHORIZED']),
    message: z.string().optional(),
  })
)

const contract = defineContract({
  basePath: '/api',
  errors: { 401: apiError },
  routes: {
    health: route.get('/health', {
      responses: { 200: response.text(z.literal('ok')) },
    }),
    organizations: router('/organizations/:organizationId', {
      params: z.object({ organizationId: z.string() }),
      routes: {
        listUsers: route.get('/users', {
          query: z.object({ limit: text.integer() }),
          responses: { 200: response.json(z.array(user)) },
        }),
        createUser: route.post('/users/:userId', {
          params: z.object({ userId: z.string() }),
          query: z.object({ notify: text.boolean() }),
          headers: z.object({ 'x-actor-id': z.string() }),
          body: z.object({ createdAt: dateTime }),
          responses: {
            201: response.json(user, {
              headers: z.object({ etag: z.string() }),
            }),
            409: apiError,
          },
        }),
      },
    }),
  },
})

describe('defineServer', () => {
  test('preserves literal paths in route metadata types', () => {
    type Metadata = ServerRouteMetadata<typeof contract>
    type Health = Extract<Metadata, { readonly key: readonly ['health'] }>
    type ListUsers = Extract<Metadata, { readonly key: readonly ['organizations', 'listUsers'] }>
    type CreateUser = Extract<Metadata, { readonly key: readonly ['organizations', 'createUser'] }>

    expectTypeOf<Health>().toEqualTypeOf<{
      readonly key: readonly ['health']
      readonly method: 'GET'
      readonly path: '/api/health'
    }>()
    expectTypeOf<ListUsers>().toEqualTypeOf<{
      readonly key: readonly ['organizations', 'listUsers']
      readonly method: 'GET'
      readonly path: '/api/organizations/:organizationId/users'
    }>()
    expectTypeOf<CreateUser>().toEqualTypeOf<{
      readonly key: readonly ['organizations', 'createUser']
      readonly method: 'POST'
      readonly path: '/api/organizations/:organizationId/users/:userId'
    }>()
  })

  test('creates a frozen transport-neutral authoring scope', () => {
    const server = defineServer(contract)

    expect(server.contract).toBe(contract)
    expect(server.context).toBeUndefined()
    expect(server.middlewares).toEqual([])
    expect(server).not.toHaveProperty('fetch')
    expect(Object.isFrozen(server)).toBe(true)
    expect(Object.isFrozen(server.middlewares)).toBe(true)
  })

  test('types partial fragments from the contract and shared context', () => {
    const server = defineServer(contract, {
      context: ({ request, route: metadata }) => ({
        requestId: request.headers.get('x-request-id') ?? metadata.key.join('.'),
      }),
    })

    const healthHandlers = server.implement({
      health(actions, args) {
        expectTypeOf(args.context.requestId).toEqualTypeOf<string>()
        expectTypeOf(args.request.signal).toEqualTypeOf<AbortSignal>()
        expectTypeOf(args.route).toEqualTypeOf<{
          readonly key: readonly ['health']
          readonly method: 'GET'
          readonly path: '/api/health'
        }>()
        return actions.respond({ status: 200, body: 'ok' })
      },
    })
    const createUserHandlers = server.implement({
      organizations: {
        createUser(actions, args) {
          expectTypeOf(args.body.createdAt).toEqualTypeOf<Date>()
          expectTypeOf(args.context.requestId).toEqualTypeOf<string>()
          expectTypeOf(args.params).toEqualTypeOf<{ organizationId: string } & { userId: string }>()
          expectTypeOf(args.query.notify).toEqualTypeOf<boolean>()
          expectTypeOf(args.headers['x-actor-id']).toEqualTypeOf<string>()
          expectTypeOf(args.route).toEqualTypeOf<{
            readonly key: readonly ['organizations', 'createUser']
            readonly method: 'POST'
            readonly path: '/api/organizations/:organizationId/users/:userId'
          }>()

          if (!args.query.notify) {
            return actions.respond({ status: 409, body: { code: 'CONFLICT' } })
          }

          return actions.respond({
            status: 201,
            body: {
              id: args.params.userId,
              organizationId: args.params.organizationId,
              createdAt: args.body.createdAt,
            },
            headers: { etag: `"${args.params.userId}"` },
          })
        },
      },
    })
    const listUserHandlers = server.implement({
      organizations: {
        listUsers(actions, args) {
          expectTypeOf(args.params.organizationId).toEqualTypeOf<string>()
          expectTypeOf(args.query.limit).toEqualTypeOf<number>()
          expectTypeOf(args.route.key).toEqualTypeOf<readonly ['organizations', 'listUsers']>()
          expectTypeOf(args.route.path).toEqualTypeOf<'/api/organizations/:organizationId/users'>()
          return actions.respond({ status: 200, body: [] })
        },
      },
    })
    const implementation = server.build(healthHandlers, createUserHandlers, listUserHandlers)

    expectTypeOf(server.context).toEqualTypeOf<
      ServerContextFactory<{ requestId: string }, typeof contract> | undefined
    >()
    expectTypeOf(implementation).toExtend<ServerImplementation<typeof contract, { requestId: string }>>()
    expect(implementation.contract).toBe(contract)
    expect(implementation.handlers.health).toBe(healthHandlers.health)
    expect(implementation.handlers.organizations.createUser).toBe(createUserHandlers.organizations?.createUser)
    expect(implementation.handlers.organizations.listUsers).toBe(listUserHandlers.organizations?.listUsers)
    expect(Object.isFrozen(healthHandlers)).toBe(true)
    expect(Object.isFrozen(createUserHandlers.organizations)).toBe(true)
    expect(Object.isFrozen(implementation)).toBe(true)
    expect(Object.isFrozen(implementation.handlers)).toBe(true)
    expect(Object.isFrozen(implementation.handlers.organizations)).toBe(true)
  })

  test('requires complete non-overlapping fragments at compile time', () => {
    const server = defineServer(contract)
    const healthHandlers = server.implement({
      health: (actions) => actions.respond({ status: 200, body: 'ok' }),
    })
    const organizationHandlers = server.implement({
      organizations: {
        listUsers: (actions) => actions.respond({ status: 200, body: [] }),
        createUser: (actions, args) =>
          args.query.notify
            ? actions.respond({
                status: 201,
                body: { id: 'user-1', organizationId: args.params.organizationId, createdAt: new Date() },
                headers: { etag: 'user-1' },
              })
            : actions.respond({ status: 409, body: { code: 'CONFLICT' } }),
      },
    })

    const invalidImplementations = () => {
      // @ts-expect-error organizations.listUsers and organizations.createUser are missing
      server.build(healthHandlers)
      // @ts-expect-error health is implemented more than once
      server.build(healthHandlers, healthHandlers, organizationHandlers)
    }

    expectTypeOf(invalidImplementations).toBeFunction()
    expect(server.build(healthHandlers, organizationHandlers).handlers.health).toBe(healthHandlers.health)
  })

  test('requires handler returns to match a declared response', () => {
    const server = defineServer(contract)

    const invalidHandlers = () => {
      server.implement({
        // @ts-expect-error Handler results cannot contain fields outside the declared response shape.
        health: async (actions) => actions.respond({ status: 200, body: 'ok', foo: 1 }),
      })
      // @ts-expect-error The response body must match the output of its declared schema.
      server.implement({ health: (actions) => actions.respond({ status: 200, body: 'unhealthy' }) })
      // @ts-expect-error The status must select one of the route's declared responses.
      server.implement({ health: (actions) => actions.respond({ status: 201, body: 'ok' }) })
      server.implement({
        organizations: {
          // @ts-expect-error A handler must cover both its 201 and 409 responses.
          createUser: (actions) =>
            actions.respond({
              status: 201,
              body: { id: 'user-1', organizationId: 'organization-1', createdAt: new Date() },
              headers: { etag: 'user-1' },
            }),
        },
      })
    }

    expectTypeOf(invalidHandlers).toBeFunction()
  })

  test('checks fragment ownership, duplicates, and completeness at runtime', () => {
    const server = defineServer(contract)
    const otherServer = defineServer(contract)
    const healthHandlers = server.implement({
      health: (actions) => actions.respond({ status: 200, body: 'ok' }),
    })
    const foreignHandlers = otherServer.implement({
      health: (actions) => actions.respond({ status: 200, body: 'ok' }),
    })
    const build = server.build as unknown as (...fragments: readonly object[]) => unknown

    expect(() => build(healthHandlers)).toThrowError(
      expect.objectContaining<Partial<ServerImplementationError>>({
        code: 'missing-handler',
        handlerKeys: ['organizations.listUsers', 'organizations.createUser'],
      })
    )
    expect(() => build(healthHandlers, healthHandlers)).toThrowError(
      expect.objectContaining<Partial<ServerImplementationError>>({
        code: 'duplicate-handler',
        handlerKeys: ['health'],
      })
    )
    expect(() => build(foreignHandlers)).toThrowError(
      expect.objectContaining<Partial<ServerImplementationError>>({ code: 'invalid-fragment' })
    )
  })

  test('checks unknown and invalid fragment entries at runtime', () => {
    const server = defineServer(contract)
    const implement = server.implement as unknown as (fragment: object) => object

    expect(() => implement({ unknown: () => undefined })).toThrowError(
      expect.objectContaining<Partial<ServerImplementationError>>({
        code: 'unknown-handler',
        handlerKeys: ['unknown'],
      })
    )
    expect(() => implement({ toString: () => undefined })).toThrowError(
      expect.objectContaining<Partial<ServerImplementationError>>({
        code: 'unknown-handler',
        handlerKeys: ['toString'],
      })
    )
    expect(() => implement({ health: 'not a function' })).toThrowError(
      expect.objectContaining<Partial<ServerImplementationError>>({
        code: 'invalid-handler',
        handlerKeys: ['health'],
      })
    )
  })

  test('preserves middleware for backend integrations to execute', async () => {
    const middleware: ServerMiddleware<{ requestId: string }, typeof contract, never> = async (
      actions,
      { context, route: metadata }
    ) => {
      expectTypeOf(context.requestId).toEqualTypeOf<string>()
      expectTypeOf(metadata.path).toExtend<string>()
      return actions.next()
    }
    const base = defineServer(contract, { context: () => ({ requestId: 'request-1' }) })
    const server = base.use(base.middleware(middleware))
    const implementation = server.build(
      server.implement({
        health: (actions) => actions.respond({ status: 200, body: 'ok' }),
      }),
      server.implement({
        organizations: {
          listUsers: (actions) => actions.respond({ status: 200, body: [] }),
          createUser: (actions, args) =>
            args.query.notify
              ? actions.respond({
                  status: 201,
                  body: { id: 'user-1', organizationId: args.params.organizationId, createdAt: new Date() },
                  headers: { etag: 'user-1' },
                })
              : actions.respond({ status: 409, body: { code: 'CONFLICT' } }),
        },
      })
    )

    await expect(
      implementation.middlewares.health[0]?.<string>(
        {
          next: async () => 'adapter-result' as never,
          error: (status, value) => ({ ...value, status }) as never,
        },
        {
          context: { requestId: 'request-1' },
          request: new Request('https://example.test'),
          route: { key: ['health'], method: 'GET', path: '/api/health' },
        }
      )
    ).resolves.toBe('adapter-result')
  })

  test('composes fragments from scopes with different middleware stacks', () => {
    const scopedContract = defineContract({
      errors: { 401: apiError },
      routes: {
        health: route.get('/health', { responses: { 200: response.text(z.literal('ok')) } }),
        profile: route.get('/profile', {
          responses: { 200: response.json(z.object({ id: z.string() })) },
        }),
      },
    })
    const base = defineServer(scopedContract)
    const logging = base.middleware((actions) => actions.next())
    const authenticated = base.middleware((actions) =>
      Math.random() > 0.5 ? actions.next() : actions.error(401, { body: { code: 'UNAUTHORIZED' } })
    )
    const publicServer = base.use(logging)
    const protectedServer = publicServer.use(authenticated)
    const healthHandlers = publicServer.implement({
      health: (actions) => actions.respond({ status: 200, body: 'ok' }),
    })
    const profileHandlers = protectedServer.implement({
      profile: (actions) => actions.respond({ status: 200, body: { id: 'user-1' } }),
    })
    const implementation = base.build(healthHandlers, profileHandlers)

    expect(base.middlewares).toEqual([])
    expect(publicServer.middlewares).toEqual([logging])
    expect(protectedServer.middlewares).toEqual([logging, authenticated])
    expect(implementation.middlewares.health).toEqual([logging])
    expect(implementation.middlewares.profile).toEqual([logging, authenticated])
    expect(Object.isFrozen(implementation.middlewares)).toBe(true)
    expect(Object.isFrozen(implementation.middlewares.health)).toBe(true)
    expectTypeOf(implementation.middlewares.health).toEqualTypeOf<
      readonly ServerMiddleware<Record<string, never>, typeof scopedContract, never>[]
    >()
    expectTypeOf(implementation.middlewares.profile).toEqualTypeOf<
      readonly ServerMiddleware<Record<string, never>, typeof scopedContract, 401>[]
    >()
  })

  test('infers middleware errors from contract-bound actions', () => {
    const protectedContract = defineContract({
      errors: { 401: apiError },
      routes: {
        profile: route.get('/profile', {
          responses: { 200: response.json(z.object({ id: z.string() })) },
        }),
      },
    })
    const base = defineServer(protectedContract)
    const authenticated = base.middleware((actions) =>
      Math.random() > 0.5 ? actions.next() : actions.error(401, { body: { code: 'UNAUTHORIZED' } })
    )
    const server = base.use(authenticated)

    const handlers = server.implement({
      profile: (actions) => actions.respond({ status: 200, body: { id: 'user-1' } }),
    })

    type MiddlewareStatuses =
      typeof server extends ServerDefinition<typeof protectedContract, Record<string, never>, infer Status>
        ? Status
        : never

    expectTypeOf<MiddlewareStatuses>().toEqualTypeOf<401>()
    expectTypeOf(server.build(handlers)['middlewares']['profile']).toEqualTypeOf<
      readonly ServerMiddleware<Record<string, never>, typeof protectedContract>[]
    >()

    const invalidMiddleware = () => {
      // @ts-expect-error Middleware must continue or construct a contract error.
      base.middleware(() => 'not-a-response')
      base.middleware((actions) =>
        // @ts-expect-error Middleware errors must match the selected contract error body.
        actions.error(401, { body: { code: 'NOT_DECLARED' } })
      )
      base.middleware((actions) =>
        // @ts-expect-error Middleware can only select statuses declared in contract.errors.
        actions.error(403, { body: { code: 'UNAUTHORIZED' } })
      )
    }
    expectTypeOf(invalidMiddleware).toBeFunction()
  })

  test('provides a complete generic boundary for backend adapters', () => {
    function defineTestAdapter<ContractType extends Contract, Context extends object>(
      server: ServerImplementation<ContractType, Context>
    ): ServerImplementation<ContractType, Context> {
      return server
    }

    const server = defineServer(contract)
    const implementation = server.build(
      server.implement({ health: (actions) => actions.respond({ status: 200, body: 'ok' }) }),
      server.implement({
        organizations: {
          listUsers: (actions) => actions.respond({ status: 200, body: [] }),
          createUser: (actions, args) =>
            args.query.notify
              ? actions.respond({
                  status: 201,
                  body: { id: 'user-1', organizationId: args.params.organizationId, createdAt: new Date() },
                  headers: { etag: 'user-1' },
                })
              : actions.respond({ status: 409, body: { code: 'CONFLICT' } }),
        },
      })
    )

    expect(defineTestAdapter(implementation)).toBe(implementation)
  })

  test('exports response result unions without implementing serialization', () => {
    type CreateUserResponses = typeof contract.routes.organizations.createUser.responses
    type Result = ServerResponseResult<CreateUserResponses>
    type Created = Extract<Result, { readonly status: 201 }>
    type Conflict = Extract<Result, { readonly status: 409 }>

    expectTypeOf<Result['status']>().toEqualTypeOf<201 | 409>()
    expectTypeOf<Created['body']>().toEqualTypeOf<z.output<typeof user>>()
    expectTypeOf<Created['headers']>().toEqualTypeOf<{ etag: string }>()
    expectTypeOf<Conflict['body']>().toEqualTypeOf<{
      code: 'CONFLICT' | 'UNAUTHORIZED'
      message?: string
    }>()
    expectTypeOf<Conflict['headers']>().toEqualTypeOf<HeadersInit | undefined>()
  })

  test('preserves prototype-like handler keys safely', () => {
    const keyedContract = defineContract({
      routes: {
        ['__proto__']: route.get('/safe', { responses: { 200: response.text(z.literal('ok')) } }),
      },
    })
    const server = defineServer(keyedContract)
    const fragment = server.implement({
      ['__proto__']: (actions) => actions.respond({ status: 200, body: 'ok' }),
    })
    const implementation = server.build(fragment)

    expect(Object.keys(implementation.handlers)).toEqual(['__proto__'])
    expect(Object.getPrototypeOf(implementation.handlers)).toBe(Object.prototype)
    expect(typeof implementation.handlers['__proto__']).toBe('function')
  })
})
