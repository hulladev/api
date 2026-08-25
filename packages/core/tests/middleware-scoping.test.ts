import { describe, expect, expectTypeOf, test } from 'vitest'
import { createAdapterHandler } from '../src/adapters'
import { defineClient } from '../src/client'
import { defineContract } from '../src/contract'
import { response } from '../src/contract/response'
import { route } from '../src/contract/route'
import { router } from '../src/contract/router'
import { defineErrors } from '../src/declared-errors'
import { inProcessTransport } from '../src/in-process'
import { defineServer } from '../src/server'

const contract = defineContract({
  routes: {
    health: route.get('/health', { responses: { 200: response.text() } }),
    users: router('/users', {
      routes: {
        list: route.get('/', { responses: { 200: response.text() } }),
        profile: route.get('/profile', { responses: { 200: response.text() } }),
      },
    }),
  },
})

describe('middleware scoping', () => {
  test('applies ordered global, router, and route middleware on the server', async () => {
    const calls: string[] = []
    const base = defineServer(contract)
    const global = base.middleware(({ next, route }) => {
      calls.push(`global:${route.key.join('.')}`)
      return next()
    })
    const users = base.middleware(({ next, route }) => {
      calls.push(`users:${route.key.join('.')}`)
      return next()
    })
    const profile = base.middleware(({ next, route }) => {
      calls.push(`profile:${route.key.join('.')}`)
      return next()
    })
    const implementation = base
      .use(global)
      .use(contract.routes.users, users)
      .use(contract.routes.users.profile, profile)
      .implement({
        health: ({ response }) => {
          calls.push('handler:health')
          return response(200, 'ok')
        },
        users: {
          list: ({ response }) => {
            calls.push('handler:users.list')
            return response(200, 'users')
          },
          profile: ({ response }) => {
            calls.push('handler:users.profile')
            return response(200, 'profile')
          },
        },
      })
    const client = defineClient(contract, { transport: inProcessTransport(implementation) }).create()

    await client.health()
    expect(calls).toEqual(['global:health', 'handler:health'])

    calls.length = 0
    await client.users.list()
    expect(calls).toEqual(['global:users.list', 'users:users.list', 'handler:users.list'])

    calls.length = 0
    await client.users.profile()
    expect(calls).toEqual([
      'global:users.profile',
      'users:users.profile',
      'profile:users.profile',
      'handler:users.profile',
    ])
    expect(implementation.middlewares).toEqual([global, users, profile])
  })

  test('uses the same contract-node scoping syntax on the client', async () => {
    const implementation = defineServer(contract).implement({
      health: ({ response }) => response(200, 'ok'),
      users: {
        list: ({ response }) => response(200, 'users'),
        profile: ({ response }) => response(200, 'profile'),
      },
    })
    const calls: string[] = []
    const base = defineClient(contract, { transport: inProcessTransport(implementation) })
    const global = base.middleware(({ next, route }) => {
      calls.push(`global:${route.key.join('.')}`)
      return next()
    })
    const users = base.middleware(({ next, route }) => {
      calls.push(`users:${route.key.join('.')}`)
      return next()
    })
    const profile = base.middleware(({ next, route }) => {
      calls.push(`profile:${route.key.join('.')}`)
      return next()
    })
    const definition = base.use(global).use(contract.routes.users, users).use(contract.routes.users.profile, profile)
    const client = definition.create()

    await client.health()
    expect(calls).toEqual(['global:health'])

    calls.length = 0
    await client.users.list()
    expect(calls).toEqual(['global:users.list', 'users:users.list'])

    calls.length = 0
    await client.users.profile()
    expect(calls).toEqual(['global:users.profile', 'users:users.profile', 'profile:users.profile'])
    expect(definition.middlewares).toEqual([global, users, profile])
  })

  test('keeps fragment-based middleware scoping compatible', async () => {
    const calls: string[] = []
    const base = defineServer(contract)
    const users = base.middleware(({ next }) => {
      calls.push('users')
      return next()
    })
    const health = base.implement(contract.routes.health, ({ response }) => response(200, 'ok'))
    const userHandlers = base.use(users).implement(contract.routes.users, {
      list: ({ response }) => response(200, 'users'),
      profile: ({ response }) => response(200, 'profile'),
    })
    const implementation = base.implement(health, userHandlers)
    const client = defineClient(contract, { transport: inProcessTransport(implementation) }).create()

    await client.health()
    expect(calls).toEqual([])
    await client.users.list()
    expect(calls).toEqual(['users'])
  })

  test('keeps client fragment middleware scoping compatible', async () => {
    const implementation = defineServer(contract).implement({
      health: ({ response }) => response(200, 'ok'),
      users: {
        list: ({ response }) => response(200, 'users'),
        profile: ({ response }) => response(200, 'profile'),
      },
    })
    const calls: string[] = []
    const base = defineClient(contract, { transport: inProcessTransport(implementation) })
    const usersMiddleware = base.middleware(({ next }) => {
      calls.push('users')
      return next()
    })
    const health = base.create(contract.routes.health)
    const users = base.use(usersMiddleware).create(contract.routes.users)
    const client = base.create(health, users)

    await client.health()
    expect(calls).toEqual([])
    await client.users.list()
    expect(calls).toEqual(['users'])
  })

  test('executes separate overlapping registrations without identity deduplication', async () => {
    const calls: string[] = []
    const base = defineServer(contract)
    const middleware = base.middleware(({ next }) => {
      calls.push('middleware')
      return next()
    })
    const implementation = base
      .use(contract.routes.users, middleware)
      .use(contract.routes.users.profile, middleware)
      .implement({
        health: ({ response }) => response(200, 'ok'),
        users: {
          list: ({ response }) => response(200, 'users'),
          profile: ({ response }) => response(200, 'profile'),
        },
      })
    const client = defineClient(contract, { transport: inProcessTransport(implementation) }).create()

    await client.users.profile()
    expect(calls).toEqual(['middleware', 'middleware'])
  })

  test('preserves declaration order when global middleware follows scoped middleware', async () => {
    const calls: string[] = []
    const base = defineServer(contract)
    const scoped = base.middleware(({ next }) => {
      calls.push('scoped')
      return next()
    })
    const global = base.middleware(({ next }) => {
      calls.push('global')
      return next()
    })
    const implementation = base
      .use(contract.routes.users, scoped)
      .use(global)
      .implement({
        health: ({ response }) => response(200, 'ok'),
        users: {
          list: ({ response }) => response(200, 'users'),
          profile: ({ response }) => response(200, 'profile'),
        },
      })
    const client = defineClient(contract, { transport: inProcessTransport(implementation) }).create()

    await client.users.list()
    expect(calls).toEqual(['scoped', 'global'])
    calls.length = 0
    await client.health()
    expect(calls).toEqual(['global'])
  })

  test('executes client and server middleware as an onion while isolating sibling routes', async () => {
    const calls: string[] = []
    const server = defineServer(contract)
    const serverGlobal = server.middleware(async ({ next }) => {
      calls.push('server-global:before')
      const result = await next()
      calls.push('server-global:after')
      return result
    })
    const serverUsers = server.middleware(async ({ next }) => {
      calls.push('server-users:before')
      const result = await next()
      calls.push('server-users:after')
      return result
    })
    const implementation = server
      .use(serverGlobal)
      .use(contract.routes.users, serverUsers)
      .implement({
        health: ({ response }) => {
          calls.push('handler:health')
          return response(200, 'ok')
        },
        users: {
          list: ({ response }) => response(200, 'users'),
          profile: ({ response }) => {
            calls.push('handler:users.profile')
            return response(200, 'profile')
          },
        },
      })

    const client = defineClient(contract, { transport: inProcessTransport(implementation) })
    const clientGlobal = client.middleware(async ({ next }) => {
      calls.push('client-global:before')
      const result = await next()
      calls.push('client-global:after')
      return result
    })
    const clientUsers = client.middleware(async ({ next }) => {
      calls.push('client-users:before')
      const result = await next()
      calls.push('client-users:after')
      return result
    })
    const api = client.use(clientGlobal).use(contract.routes.users, clientUsers).create()

    await api.users.profile()
    expect(calls).toEqual([
      'client-global:before',
      'client-users:before',
      'server-global:before',
      'server-users:before',
      'handler:users.profile',
      'server-users:after',
      'server-global:after',
      'client-users:after',
      'client-global:after',
    ])

    calls.length = 0
    await api.health()
    expect(calls).toEqual([
      'client-global:before',
      'server-global:before',
      'handler:health',
      'server-global:after',
      'client-global:after',
    ])
  })

  test('keeps parent and sibling middleware plans immutable on the server', async () => {
    const calls: string[] = []
    const base = defineServer(contract)
    const users = base.middleware(({ next }) => {
      calls.push('users')
      return next()
    })
    const profile = base.middleware(({ next }) => {
      calls.push('profile')
      return next()
    })
    const global = base.middleware(({ next }) => {
      calls.push('global')
      return next()
    })
    const usersOnly = base.use(contract.routes.users, users)
    const profileBranch = usersOnly.use(contract.routes.users.profile, profile)
    const globalBranch = usersOnly.use(global)
    const implement = (definition: typeof base) =>
      definition.implement({
        health: ({ response }) => response(200, 'ok'),
        users: {
          list: ({ response }) => response(200, 'users'),
          profile: ({ response }) => response(200, 'profile'),
        },
      })

    expect(base.middlewares).toEqual([])
    expect(usersOnly.middlewares).toEqual([users])
    expect(profileBranch.middlewares).toEqual([users, profile])
    expect(globalBranch.middlewares).toEqual([users, global])

    const baseClient = defineClient(contract, { transport: inProcessTransport(implement(base)) }).create()
    const usersClient = defineClient(contract, { transport: inProcessTransport(implement(usersOnly)) }).create()
    const profileClient = defineClient(contract, { transport: inProcessTransport(implement(profileBranch)) }).create()
    const globalClient = defineClient(contract, { transport: inProcessTransport(implement(globalBranch)) }).create()

    await baseClient.users.profile()
    expect(calls).toEqual([])
    await usersClient.users.profile()
    expect(calls).toEqual(['users'])
    calls.length = 0
    await profileClient.users.profile()
    expect(calls).toEqual(['users', 'profile'])
    calls.length = 0
    await globalClient.health()
    expect(calls).toEqual(['global'])
    calls.length = 0
    await globalClient.users.profile()
    expect(calls).toEqual(['users', 'global'])
  })

  test('keeps parent and sibling middleware plans immutable on the client', async () => {
    const implementation = defineServer(contract).implement({
      health: ({ response }) => response(200, 'ok'),
      users: {
        list: ({ response }) => response(200, 'users'),
        profile: ({ response }) => response(200, 'profile'),
      },
    })
    const calls: string[] = []
    const base = defineClient(contract, { transport: inProcessTransport(implementation) })
    const users = base.middleware(({ next }) => {
      calls.push('users')
      return next()
    })
    const profile = base.middleware(({ next }) => {
      calls.push('profile')
      return next()
    })
    const global = base.middleware(({ next }) => {
      calls.push('global')
      return next()
    })
    const usersOnly = base.use(contract.routes.users, users)
    const profileBranch = usersOnly.use(contract.routes.users.profile, profile)
    const globalBranch = usersOnly.use(global)

    expect(base.middlewares).toEqual([])
    expect(usersOnly.middlewares).toEqual([users])
    expect(profileBranch.middlewares).toEqual([users, profile])
    expect(globalBranch.middlewares).toEqual([users, global])

    await base.create().users.profile()
    expect(calls).toEqual([])
    await usersOnly.create().users.profile()
    expect(calls).toEqual(['users'])
    calls.length = 0
    await profileBranch.create().users.profile()
    expect(calls).toEqual(['users', 'profile'])
    calls.length = 0
    await globalBranch.create().health()
    expect(calls).toEqual(['global'])
    calls.length = 0
    await globalBranch.create().users.profile()
    expect(calls).toEqual(['users', 'global'])
  })

  test('preserves route-scoped middleware through server fragments and enforces scope ancestry', async () => {
    const calls: string[] = []
    const base = defineServer(contract)
    const global = base.middleware(({ next }) => {
      calls.push('global')
      return next()
    })
    const users = base.middleware(({ next }) => {
      calls.push('users')
      return next()
    })
    const branch = base.use(global).use(contract.routes.users, users)
    const health = branch.implement(contract.routes.health, ({ response }) => response(200, 'ok'))
    const userHandlers = branch.implement(contract.routes.users, {
      list: ({ response }) => response(200, 'users'),
      profile: ({ response }) => response(200, 'profile'),
    })
    const implementation = base.implement(health, userHandlers)
    const api = defineClient(contract, { transport: inProcessTransport(implementation) }).create()

    await api.health()
    expect(calls).toEqual(['global'])
    calls.length = 0
    await api.users.list()
    expect(calls).toEqual(['global', 'users'])

    const unscopedHealth = base.implement(contract.routes.health, ({ response }) => response(200, 'ok'))
    expect(() => branch.implement(unscopedHealth, userHandlers)).toThrowError(
      'Server fragment has an incompatible middleware scope'
    )
  })

  test('preserves route-scoped middleware through client fragments and enforces scope ancestry', async () => {
    const implementation = defineServer(contract).implement({
      health: ({ response }) => response(200, 'ok'),
      users: {
        list: ({ response }) => response(200, 'users'),
        profile: ({ response }) => response(200, 'profile'),
      },
    })
    const calls: string[] = []
    const base = defineClient(contract, { transport: inProcessTransport(implementation) })
    const global = base.middleware(({ next }) => {
      calls.push('global')
      return next()
    })
    const users = base.middleware(({ next }) => {
      calls.push('users')
      return next()
    })
    const branch = base.use(global).use(contract.routes.users, users)
    const health = branch.create(contract.routes.health)
    const userCalls = branch.create(contract.routes.users)
    const api = base.create(health, userCalls)

    await api.health()
    expect(calls).toEqual(['global'])
    calls.length = 0
    await api.users.list()
    expect(calls).toEqual(['global', 'users'])

    const unscopedHealth = base.create(contract.routes.health)
    expect(() => branch.create(unscopedHealth, userCalls)).toThrowError(
      'Client fragment has an incompatible middleware scope'
    )
  })

  test('rejects middleware that calls next more than once on the client and server', async () => {
    let serverHandlerCalls = 0
    let serverError: unknown
    const server = defineServer(contract)
    const duplicateServerNext = server.middleware(async ({ next }) => {
      await next()
      return next()
    })
    const implementation = server.use(duplicateServerNext).implement({
      health: ({ response }) => {
        serverHandlerCalls++
        return response(200, 'ok')
      },
      users: {
        list: ({ response }) => response(200, 'users'),
        profile: ({ response }) => response(200, 'profile'),
      },
    })
    const dispatch = createAdapterHandler(implementation, {
      onError: ({ error }) => {
        serverError = error
      },
    })

    const serverResponse = await dispatch({ request: {}, method: 'GET', pathname: '/health' })
    expect(serverHandlerCalls).toBe(1)
    expect(serverResponse.status).toBe(500)
    expect(serverError).toEqual(expect.objectContaining({ message: 'Server middleware called next() more than once' }))

    let clientTransportCalls = 0
    const clientImplementation = defineServer(contract).implement({
      health: ({ response }) => response(200, 'ok'),
      users: {
        list: ({ response }) => response(200, 'users'),
        profile: ({ response }) => response(200, 'profile'),
      },
    })
    const transport = inProcessTransport(clientImplementation)
    const client = defineClient(contract, {
      transport: async (request) => {
        clientTransportCalls++
        return transport(request)
      },
    })
    const duplicateClientNext = client.middleware(async ({ next }) => {
      await next()
      return next()
    })

    await expect(client.use(duplicateClientNext).create().health()).rejects.toThrowError(
      'Client middleware called next() more than once'
    )
    expect(clientTransportCalls).toBe(1)
  })

  test('allows scoped middleware to short-circuit without executing inner work', async () => {
    const failures = defineErrors({ BLOCKED: { message: 'Blocked' } })
    const gatedContract = defineContract({
      errors: { 403: failures.BLOCKED },
      routes: {
        public: route.get('/public', { responses: { 200: response.text() } }),
        private: route.get('/private', { responses: { 200: response.text() } }),
      },
    })
    let publicHandlerCalls = 0
    let privateHandlerCalls = 0
    const server = defineServer(gatedContract)
    const blockPrivate = server.middleware(({ errors }) => errors.BLOCKED())
    const implementation = server.use(gatedContract.routes.private, blockPrivate).implement({
      public: ({ response }) => {
        publicHandlerCalls++
        return response(200, 'public')
      },
      private: ({ response }) => {
        privateHandlerCalls++
        return response(200, 'private')
      },
    })
    const gatedClient = defineClient(gatedContract, { transport: inProcessTransport(implementation) }).create()

    await expect(gatedClient.public()).resolves.toMatchObject({ status: 200, body: 'public' })
    await expect(gatedClient.private()).resolves.toMatchObject({
      status: 403,
      body: { code: 'BLOCKED', message: 'Blocked' },
    })
    expect(publicHandlerCalls).toBe(1)
    expect(privateHandlerCalls).toBe(0)

    const clientImplementation = defineServer(contract).implement({
      health: ({ response }) => response(200, 'ok'),
      users: {
        list: ({ response }) => response(200, 'users'),
        profile: ({ response }) => response(200, 'profile'),
      },
    })
    let transportCalls = 0
    const transport = inProcessTransport(clientImplementation)
    const client = defineClient(contract, {
      transport: async (request) => {
        transportCalls++
        return transport(request)
      },
    })
    const blocked = new Error('Client request blocked')
    const blockUsers = client.middleware(async () => {
      throw blocked
    })
    const api = client.use(contract.routes.users, blockUsers).create()

    await expect(api.health()).resolves.toMatchObject({ status: 200, body: 'ok' })
    await expect(api.users.profile()).rejects.toBe(blocked)
    expect(transportCalls).toBe(1)
  })

  test('rejects foreign middleware targets and keeps the root target out of the typed API', () => {
    const foreignContract = defineContract({
      routes: { health: route.get('/health', { responses: { 200: response.text() } }) },
    })
    const server = defineServer(contract)
    const serverMiddleware = server.middleware(({ next }) => next())
    const client = defineClient(contract, {
      transport: () => ({ status: 200, headers: {}, readBody: () => 'ok' }),
    })
    const clientMiddleware = client.middleware(({ next }) => next())

    expect(() =>
      (server.use as (node: unknown, middleware: typeof serverMiddleware) => unknown)(
        foreignContract.routes.health,
        serverMiddleware
      )
    ).toThrowError('Server node is not mounted in this contract')
    expect(() =>
      (client.use as (node: unknown, middleware: typeof clientMiddleware) => unknown)(
        foreignContract.routes.health,
        clientMiddleware
      )
    ).toThrowError('Client node is not mounted in this contract')
    const serverUse = server.use as (...values: readonly unknown[]) => unknown
    const clientUse = client.use as (...values: readonly unknown[]) => unknown
    expect(() => serverUse()).toThrowError('Server middleware must be a function')
    expect(() => serverUse(contract.routes.users)).toThrowError('Server middleware must be a function')
    expect(() => serverUse(contract.routes.users, serverMiddleware, serverMiddleware)).toThrowError(
      'Server middleware must be a function'
    )
    expect(() => clientUse()).toThrowError('Client middleware must be a function')
    expect(() => clientUse(contract.routes.users)).toThrowError('Client middleware must be a function')
    expect(() => clientUse(contract.routes.users, clientMiddleware, clientMiddleware)).toThrowError(
      'Client middleware must be a function'
    )
    const invalidTypes = () => {
      // @ts-expect-error The root contract is represented by use(middleware), not a scoped target.
      server.use(contract, serverMiddleware)
      client.use(foreignContract.routes.health, clientMiddleware)
    }
    expectTypeOf(invalidTypes).toBeFunction()
  })
})
