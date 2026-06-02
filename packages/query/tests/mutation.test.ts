import { describe, expect, expectTypeOf, test } from 'vitest'
import { z } from 'zod'
import { api } from '../../core/src'
import { mutation } from '../src/mutation'

const users = [
  { id: 1, name: 'John' },
  { id: 2, name: 'Jane' },
] as const

const routes = api({
  plugins: [mutation()],
})
  .router('users')
  .define(({ procedure }) => ({
    all: procedure.handler(() => users),
    byId: procedure.input(z.number()).handler(async ({ input }) => users.find((user) => user.id === input)!),
  }))

describe('mutation plugin', () => {
  test('exposes shared key helpers and mutation options on finalized handlers', async () => {
    expectTypeOf(routes.byId.key.root).toEqualTypeOf<'users/byId'>()
    const boundByIdOptions = routes.byId.mutation.options(2)
    expectTypeOf(boundByIdOptions.mutationKey[0]).toEqualTypeOf<'users/byId'>()
    expectTypeOf(boundByIdOptions.mutationKey[1]).toEqualTypeOf<number>()
    expectTypeOf(boundByIdOptions.mutationFn).returns.toEqualTypeOf<Promise<(typeof users)[number]>>()

    expect(routes.all.key.root).toBe('users/all')
    expect(routes.all.key.full()).toStrictEqual(['users/all'])
    expect(routes.byId.key.full(2)).toStrictEqual(['users/byId', 2])

    expect(routes.byId.mutation.options(2)).toStrictEqual({
      mutationKey: ['users/byId', 2],
      mutationFn: expect.any(Function),
    })

    const unboundByIdOptions = routes.byId.mutation.options()
    expectTypeOf(unboundByIdOptions.mutationKey[0]).toEqualTypeOf<'users/byId'>()
    expectTypeOf(unboundByIdOptions.mutationFn).parameter(0).toEqualTypeOf<number>()
    expect(routes.byId.mutation.options()).toStrictEqual({
      mutationKey: ['users/byId'],
      mutationFn: expect.any(Function),
    })

    expect(routes.all.mutation.options().mutationFn()).toStrictEqual(users)
    await expect(routes.byId.mutation.options().mutationFn(2)).resolves.toStrictEqual(users[1])
    await expect(routes.byId.mutation.options(2).mutationFn()).resolves.toStrictEqual(users[1])
  })
})
