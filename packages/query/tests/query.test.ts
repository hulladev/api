import { api } from '../../core/src'
import { describe, expect, expectTypeOf, test } from 'vitest'
import { z } from 'zod'
import { query } from '../src/query'

const users = [
  { id: 1, name: 'John' },
  { id: 2, name: 'Jane' },
] as const

const routes = api({
  plugins: [query()],
})
  .router('users')
  .define(({ procedure }) => ({
    all: procedure.handler(() => users),
    byId: procedure
      .input(z.number())
      .handler(async ({ input }) => users.find((user) => user.id === input)!),
  }))

describe('query plugin', () => {
  test('exposes shared key helpers and query options on finalized handlers', async () => {
    expectTypeOf(routes.byId.key.root).toEqualTypeOf<'users/byId'>()
    expectTypeOf(routes.byId.key.full).parameter(0).toEqualTypeOf<number>()
    expectTypeOf(routes.byId.key.full).returns.toEqualTypeOf<readonly ['users/byId', number]>()
    const boundByIdOptions = routes.byId.query.options(1)
    expectTypeOf(boundByIdOptions.queryKey[0]).toEqualTypeOf<'users/byId'>()
    expectTypeOf(boundByIdOptions.queryKey[1]).toEqualTypeOf<number>()
    expectTypeOf(boundByIdOptions.queryFn).returns.toEqualTypeOf<Promise<(typeof users)[number]>>()

    expect(routes.all.key.root).toBe('users/all')
    expect(routes.byId.key.root).toBe('users/byId')
    expect(routes.all.key.full()).toStrictEqual(['users/all'])
    expect(routes.byId.key.full(1)).toStrictEqual(['users/byId', 1])

    expect(routes.byId.query.options(1)).toStrictEqual({
      queryKey: ['users/byId', 1],
      queryFn: expect.any(Function),
    })

    const unboundByIdOptions = routes.byId.query.options()
    expectTypeOf(unboundByIdOptions.queryKey[0]).toEqualTypeOf<'users/byId'>()
    expectTypeOf(unboundByIdOptions.queryFn).parameter(0).toEqualTypeOf<number>()
    expect(routes.byId.query.options()).toStrictEqual({
      queryKey: ['users/byId'],
      queryFn: expect.any(Function),
    })



    expect(routes.all.query.options().queryFn()).toStrictEqual(users)
    await expect(routes.byId.query.options().queryFn(1)).resolves.toStrictEqual(users[0])
    await expect(routes.byId.query.options(1).queryFn()).resolves.toStrictEqual(users[0])
  })

  test('does not expose key helpers on unnamed top-level procedures', async () => {
    const standalone = api({
      plugins: [query()],
    }).procedure.input(z.number()).handler(async ({ input }) => input * 2)

    expect(await standalone.call(2)).toBe(4)
    expect(standalone).not.toHaveProperty('key')
    expect(standalone).not.toHaveProperty('query')
    // @ts-expect-error unnamed top-level procedures do not expose key helpers
    expectTypeOf(standalone.key).toEqualTypeOf<never>()
    // @ts-expect-error unnamed top-level procedures do not expose query helpers
    expectTypeOf(standalone.query).toEqualTypeOf<never>()
  })

  test('allows aliasing through core plugin settings', () => {
    const aliasedRoutes = api({
      plugins: [query()],
      settings: {
        plugins: {
          query: {
            aliases: {
              procedure: {
                query: 'rq',
              },
            },
          },
        },
      },
    })
      .router('users')
      .define(({ procedure }) => ({
        byId: procedure.input(z.number()).handler(({ input }) => input),
      }))

    const aliased = aliasedRoutes.byId as typeof aliasedRoutes.byId & {
      rq: {
        options: ((input: number) => { queryKey: readonly [string, number] }) & (() => { queryKey: readonly [string] })
      }
    }

    expect(aliased.rq.options(2).queryKey).toStrictEqual(['users/byId', 2])
  })
})
