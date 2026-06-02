import { api } from '../../core/src'
import { describe, expect, expectTypeOf, test } from 'vitest'
import { z } from 'zod'
import { mutation } from '../src/mutation'
import { swr } from '../src/swr'

export const users = [
  { id: 1, name: 'John' },
  { id: 2, name: 'Jane' },
] as const

export const routes = api({
  plugins: [swr(), mutation()],
  settings: {
    plugins: {
      mutation: {
        aliases: {
          procedure: {
            mutation: 'swrMutation',
          },
        },
      },
    },
  },
})
  .router('users')
  .define(({ procedure }) => ({
    all: procedure.handler(() => users),
    byId: procedure
      .input(z.number())
      .handler(async ({ input }) => users.find((user) => user.id === input)!),
  }))

describe('swr plugin', () => {
  test('uses the shared query namespace with swr semantics', async () => {
    expectTypeOf(routes.byId.key.root).toEqualTypeOf<'users/byId'>()
    const [boundByIdKey, boundByIdFetcher] = routes.byId.query.options(1)
    expectTypeOf(boundByIdKey[0]).toEqualTypeOf<'users/byId'>()
    expectTypeOf(boundByIdKey[1]).toEqualTypeOf<number>()
    expectTypeOf(boundByIdFetcher).returns.toEqualTypeOf<Promise<(typeof users)[number]>>()

    expect(routes.all.key.root).toBe('users/all')
    expect(routes.all.key.full()).toStrictEqual(['users/all'])
    expect(routes.byId.key.full(1)).toStrictEqual(['users/byId', 1])
    expect(routes.byId.query.options(1)).toStrictEqual([['users/byId', 1], expect.any(Function)])
    expect(routes.byId.query.options()).toStrictEqual([['users/byId'], expect.any(Function)])

    const [allKey, allFetcher] = routes.all.query.options()
    const [byIdKey, byIdFetcher] = routes.byId.query.options(1)
    const [byIdRootKey, byIdRootFetcher] = routes.byId.query.options()
    expectTypeOf(byIdRootKey[0]).toEqualTypeOf<'users/byId'>()
    expectTypeOf(byIdRootFetcher).parameter(0).toEqualTypeOf<number>()

    expect(allKey).toStrictEqual(['users/all'])
    expect(byIdKey).toStrictEqual(['users/byId', 1])
    expect(byIdRootKey).toStrictEqual(['users/byId'])
    expect(allFetcher()).toStrictEqual(users)
    await expect(byIdRootFetcher(1)).resolves.toStrictEqual(users[0])
    await expect(byIdFetcher()).resolves.toStrictEqual(users[0])
  })

  test('works alongside a second plugin on the same handlers', async () => {
    const aliasedRoute = routes.byId as typeof routes.byId & {
      swrMutation: {
        options:
          & (() => readonly [readonly ['users/byId'], (input: number) => Promise<(typeof users)[number]>])
          & ((input: number) => readonly [readonly ['users/byId', number], () => Promise<(typeof users)[number]>])
      }
    }

    const [aliasedMutationKey, aliasedMutate] = aliasedRoute.swrMutation.options(2)
    expectTypeOf(aliasedMutationKey[0]).toEqualTypeOf<'users/byId'>()
    expectTypeOf(aliasedMutationKey[1]).toEqualTypeOf<number>()
    expectTypeOf(aliasedMutate).returns.toEqualTypeOf<Promise<(typeof users)[number]>>()

    expect(aliasedRoute.swrMutation.options(2)).toStrictEqual([['users/byId', 2], expect.any(Function)])
    expect(aliasedRoute.swrMutation.options()).toStrictEqual([['users/byId'], expect.any(Function)])

    const [key, mutate] = aliasedRoute.swrMutation.options(2)
    const [rootKey, mutateWithInput] = aliasedRoute.swrMutation.options()
    expect(key).toStrictEqual(['users/byId', 2])
    expect(rootKey).toStrictEqual(['users/byId'])
    await expect(mutateWithInput(2)).resolves.toStrictEqual(users[1])
    await expect(mutate()).resolves.toStrictEqual(users[1])
  })
})
