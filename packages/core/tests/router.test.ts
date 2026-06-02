import { describe, expect, expectTypeOf, test } from 'vitest'
import { z } from 'zod'
import { init } from '../src/api'

describe('router builder', () => {
  test('hides router use when no middleware exists', () => {
    const api = init()
    const users = api.router('users')

    expect(users).not.toHaveProperty('use')
    expectTypeOf(users.$meta.type).toEqualTypeOf<'router'>()
    expectTypeOf(users.$meta.name).toEqualTypeOf<'users'>()
    expectTypeOf(users.$meta.middleware).toEqualTypeOf<[]>()
    expect(users.$meta).toStrictEqual({
      type: 'router',
      name: 'users',
      middleware: [],
    })
  })

  test('still hides use when plugins exist but middleware does not', () => {
    const api = init({
      plugins: [{ id: 'noop' as const }],
    })

    expect(api.procedure).not.toHaveProperty('use')
    expect(api.router('users')).not.toHaveProperty('use')
    // @ts-expect-error use is not available when no middleware is passed
    expectTypeOf(api.procedure.use).toEqualTypeOf<never>()
    // @ts-expect-error use is not available when no middleware is passed
    expectTypeOf(api.router('users').use).toEqualTypeOf<never>()
  })

  test('exposes router and route metadata for defined procedures', () => {
    const api = init({
      middleware: {
        auth: () => ({ userId: 'u1' as const }),
        admin: () => ({ canDelete: true as const }),
      },
    })
    const deleteInput = z.string()

    let builderMeta: unknown

    const routes = api
      .router('users')
      .use('auth')
      .define(({ procedure }) => {
        expectTypeOf(procedure.$meta.type).toEqualTypeOf<'procedure'>()
        expectTypeOf(procedure.$meta.router).toEqualTypeOf<'users'>()
        expectTypeOf(procedure.$meta.middleware.router).toEqualTypeOf<['auth']>()
        expectTypeOf(procedure.$meta.middleware.procedure).toEqualTypeOf<[]>()
        expectTypeOf(procedure.$meta.middleware.selected).toEqualTypeOf<['auth']>()
        expectTypeOf(procedure.$meta.input).toEqualTypeOf<undefined>()
        expectTypeOf(procedure.$meta.output).toEqualTypeOf<undefined>()
        builderMeta = procedure.$meta

        return {
          getUser: procedure.handler(({ getContext }) => getContext()),
          deleteUser: procedure
            .use('admin')
            .input(deleteInput)
            .handler(({ getContext, input }) => ({
              context: getContext(),
              input,
            })),
        }
      })
    expectTypeOf(routes.getUser.$meta.type).toEqualTypeOf<'procedure'>()
    expectTypeOf(routes.getUser.$meta.name).toEqualTypeOf<'getUser'>()
    expectTypeOf(routes.getUser.$meta.router).toEqualTypeOf<'users'>()
    expectTypeOf(routes.getUser.$meta.middleware.router).toEqualTypeOf<['auth']>()
    expectTypeOf(routes.getUser.$meta.middleware.procedure).toEqualTypeOf<[]>()
    expectTypeOf(routes.getUser.$meta.middleware.selected).toEqualTypeOf<['auth']>()
    expectTypeOf(routes.getUser.$meta.input).toEqualTypeOf<undefined>()
    expectTypeOf(routes.getUser.$meta.output).toEqualTypeOf<undefined>()
    expectTypeOf(routes.getUser.key.root).toEqualTypeOf<'users/getUser'>()

    expectTypeOf(routes.deleteUser.$meta.type).toEqualTypeOf<'procedure'>()
    expectTypeOf(routes.deleteUser.$meta.name).toEqualTypeOf<'deleteUser'>()
    expectTypeOf(routes.deleteUser.$meta.router).toEqualTypeOf<'users'>()
    expectTypeOf(routes.deleteUser.$meta.middleware.router).toEqualTypeOf<['auth']>()
    expectTypeOf(routes.deleteUser.$meta.middleware.procedure).toEqualTypeOf<['admin']>()
    expectTypeOf(routes.deleteUser.$meta.middleware.selected).toEqualTypeOf<['auth', 'admin']>()
    expectTypeOf(routes.deleteUser.$meta.input).toEqualTypeOf<typeof deleteInput>()
    expectTypeOf(routes.deleteUser.$meta.output).toEqualTypeOf<undefined>()
    expectTypeOf(routes.deleteUser.key.root).toEqualTypeOf<'users/deleteUser'>()

    expect(builderMeta).toStrictEqual({
      type: 'procedure',
      router: 'users',
      middleware: {
        router: ['auth'],
        procedure: [],
        selected: ['auth'],
      },
      input: undefined,
      output: undefined,
    })

    expect(routes.getUser.$meta).toStrictEqual({
      type: 'procedure',
      name: 'getUser',
      router: 'users',
      middleware: {
        router: ['auth'],
        procedure: [],
        selected: ['auth'],
      },
      input: undefined,
      output: undefined,
    })

    expect(routes.deleteUser.$meta).toStrictEqual({
      type: 'procedure',
      name: 'deleteUser',
      router: 'users',
      middleware: {
        router: ['auth'],
        procedure: ['admin'],
        selected: ['auth', 'admin'],
      },
      input: deleteInput,
      output: undefined,
    })

    expectTypeOf(routes.getUser.call).returns.toEqualTypeOf<{ auth: { userId: 'u1' } }>()
    expectTypeOf(routes.deleteUser.call).parameter(0).toEqualTypeOf<string>()
    expectTypeOf(routes.deleteUser.call).returns.toEqualTypeOf<{
      context: {
        auth: { userId: 'u1' }
        admin: { canDelete: true }
      }
      input: string
    }>()

    expect(routes.getUser.call()).toStrictEqual({ auth: { userId: 'u1' } })
    expect(routes.getUser.key.root).toBe('users/getUser')
    expect(routes.getUser.key.full()).toStrictEqual(['users/getUser'])
    expect(routes.deleteUser.call('42')).toStrictEqual({
      context: {
        auth: { userId: 'u1' },
        admin: { canDelete: true },
      },
      input: '42',
    })
    expect(routes.deleteUser.key.root).toBe('users/deleteUser')
    expect(routes.deleteUser.key.full('42')).toStrictEqual(['users/deleteUser', '42'])
  })

  test('dedupes router and procedure middleware selections', () => {
    const api = init({
      middleware: {
        auth: () => ({ userId: 'u1' as const }),
        admin: () => ({ canDelete: true as const }),
      },
    })

    const routes = api
      .router('users')
      .use('auth')
      .define(({ procedure }) => ({
        same: procedure.use('auth', 'admin').handler(({ getContext }) => getContext()),
      }))

    expectTypeOf(routes.same.$meta.name).toEqualTypeOf<'same'>()
    expectTypeOf(routes.same.$meta.router).toEqualTypeOf<'users'>()
    expectTypeOf(routes.same.$meta.middleware.router).toEqualTypeOf<['auth']>()
    expectTypeOf(routes.same.$meta.middleware.procedure).toEqualTypeOf<['auth', 'admin']>()
    expectTypeOf(routes.same.$meta.middleware.selected).toEqualTypeOf<['auth', 'admin']>()
    expect(routes.same.$meta.middleware).toStrictEqual({
      router: ['auth'],
      procedure: ['auth', 'admin'],
      selected: ['auth', 'admin'],
    })
    expect(routes.same.call()).toStrictEqual({
      auth: { userId: 'u1' },
      admin: { canDelete: true },
    })
  })

  test('inherits api-level middleware in routers and procedures', () => {
    const api = init({
      middleware: {
        auth: () => ({ userId: 'u1' as const }),
        tenant: () => ({ tenantId: 't1' as const }),
        admin: () => ({ canDelete: true as const }),
      },
    })

    const routes = api
      .use('auth')
      .router('users')
      .use('tenant')
      .define(({ procedure }) => ({
        viewer: procedure.handler(({ getContext }) => getContext()),
        deleteUser: procedure.use('admin').handler(({ getContext }) => getContext()),
      }))

    expectTypeOf(routes.viewer.call).returns.toEqualTypeOf<{
      auth: { userId: 'u1' }
      tenant: { tenantId: 't1' }
    }>()
    expectTypeOf(routes.deleteUser.call).returns.toEqualTypeOf<{
      auth: { userId: 'u1' }
      tenant: { tenantId: 't1' }
      admin: { canDelete: true }
    }>()

    expect(routes.viewer.$meta.middleware).toStrictEqual({
      router: ['auth', 'tenant'],
      procedure: [],
      selected: ['auth', 'tenant'],
    })
    expect(routes.deleteUser.$meta.middleware).toStrictEqual({
      router: ['auth', 'tenant'],
      procedure: ['admin'],
      selected: ['auth', 'tenant', 'admin'],
    })
    expect(routes.viewer.call()).toStrictEqual({
      auth: { userId: 'u1' },
      tenant: { tenantId: 't1' },
    })
    expect(routes.deleteUser.call()).toStrictEqual({
      auth: { userId: 'u1' },
      tenant: { tenantId: 't1' },
      admin: { canDelete: true },
    })
  })

  test('executes router-defined procedures with sync, async, and transformed outputs', async () => {
    const api = init()

    const routes = api.router('users').define(({ procedure }) => ({
      hello: procedure.handler(() => 'hello' as const),
      byId: procedure.input(z.string()).handler(({ input }) => input.length),
      formattedLength: procedure
        .input(z.string())
        .output(z.number().transform((value) => value.toFixed(2)))
        .handler(({ input }) => input.length),
      asyncHello: procedure.handler(async () => 'async hello' as const),
    }))

    expect(routes.hello.call()).toBe('hello')
    expectTypeOf(routes.hello.call).returns.toEqualTypeOf<'hello'>()
    expectTypeOf(routes.hello.key.root).toEqualTypeOf<'users/hello'>()

    expect(routes.byId.call('abcd')).toBe(4)
    expectTypeOf(routes.byId.call).parameter(0).toEqualTypeOf<string>()
    expectTypeOf(routes.byId.call).returns.toEqualTypeOf<number>()
    expect(routes.byId).not.toHaveProperty('bind')
    expect(routes.byId).not.toHaveProperty('apply')
    expect(typeof routes.byId.call.bind).toBe('function')
    expectTypeOf(routes.byId.key.full).parameter(0).toEqualTypeOf<string>()
    expectTypeOf(routes.byId.key.full).returns.toEqualTypeOf<readonly ['users/byId', string]>()

    expect(routes.formattedLength.call('abcd')).toBe('4.00')
    expectTypeOf(routes.formattedLength.call).returns.toEqualTypeOf<string>()

    await expect(routes.asyncHello.call()).resolves.toBe('async hello')
    expectTypeOf(routes.asyncHello.call).returns.toEqualTypeOf<Promise<'async hello'>>()
    expect(routes.byId.key.root).toBe('users/byId')
    expect(routes.byId.key.full('abcd')).toStrictEqual(['users/byId', 'abcd'])
  })

  test('top-level procedure metadata does not expose router or name', () => {
    const api = init({
      middleware: {
        auth: () => ({ userId: 'u1' as const }),
      },
    })

    expect(api.procedure.$meta).not.toHaveProperty('router')
    expect(api.procedure.$meta).not.toHaveProperty('name')
    // @ts-expect-error top-level procedure metadata has no router
    expectTypeOf(api.procedure.$meta.router).toEqualTypeOf<never>()
  })
})
