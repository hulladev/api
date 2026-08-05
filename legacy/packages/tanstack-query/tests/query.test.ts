import { describe, expect, expectTypeOf, test } from 'vitest'
import { z } from 'zod'
import { createApi } from '../../core/src'
import { clientProcedure } from '../../core/src/client'
import { tanstackQueryPlugin } from '../src/query'

const users = [
  { id: 1, name: 'John' },
  { id: 2, name: 'Jane' },
] as const

const routes = createApi({
  plugins: [tanstackQueryPlugin()],
})
  .router('users')
  .define(({ procedure }) => ({
    all: procedure.handler(() => users),
    byId: procedure.input(z.number()).handler(async ({ input }) => users.find((user) => user.id === input)!),
  }))

describe('query plugin', () => {
  test('exposes shared key helpers and query options on finalized handlers', async () => {
    expectTypeOf(routes.byId.$key.root).toEqualTypeOf<'users/byId'>()
    expectTypeOf(routes.byId.$key.full).parameter(0).toEqualTypeOf<number>()
    expectTypeOf(routes.byId.$key.full).returns.toEqualTypeOf<readonly ['users/byId', number]>()
    const boundByIdOptions = routes.byId.$tanstack.queryOptions(1)
    expectTypeOf(boundByIdOptions.queryKey[0]).toEqualTypeOf<'users/byId'>()
    expectTypeOf(boundByIdOptions.queryKey[1]).toEqualTypeOf<number>()
    expectTypeOf(boundByIdOptions.queryFn).returns.toEqualTypeOf<Promise<(typeof users)[number]>>()

    expect(routes.all.$key.root).toBe('users/all')
    expect(routes.byId.$key.root).toBe('users/byId')
    expect(routes.all.$key.full()).toStrictEqual(['users/all'])
    expect(routes.byId.$key.full(1)).toStrictEqual(['users/byId', 1])

    expect(routes.byId.$tanstack.queryOptions(1)).toStrictEqual({
      queryKey: ['users/byId', 1],
      queryFn: expect.any(Function),
    })

    expect(routes.all.$tanstack.queryOptions().queryFn()).toStrictEqual(users)
    await expect(routes.byId.$tanstack.queryOptions(1).queryFn()).resolves.toStrictEqual(users[0])
    // @ts-expect-error input procedures require a bound input
    expect(() => routes.byId.$tanstack.queryOptions()).toThrow('requires the procedure input')
  })

  test('does not expose key helpers on unnamed top-level procedures', async () => {
    const standalone = createApi({
      plugins: [tanstackQueryPlugin()],
    })
      .procedure.input(z.number())
      .handler(async ({ input }) => input * 2)

    expect(await standalone(2)).toBe(4)
    expect(standalone).not.toHaveProperty('$key')
    expect(standalone).not.toHaveProperty('$tanstack')
    // @ts-expect-error unnamed top-level procedures do not expose key helpers
    expectTypeOf(standalone.$key).toEqualTypeOf<never>()
    // @ts-expect-error unnamed top-level procedures do not expose query helpers
    expectTypeOf(standalone.$tanstack).toEqualTypeOf<never>()
  })

  test('allows aliasing through core plugin settings', () => {
    const aliasedRoutes = createApi({
      plugins: [tanstackQueryPlugin()],
      settings: {
        plugins: {
          tanstackQuery: {
            aliases: {
              procedure: {
                queryOptions: 'rq',
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
      $tanstack: {
        rq: (input: number) => { queryKey: readonly [string, number] }
      }
    }

    expect(aliased.$tanstack.rq(2).queryKey).toStrictEqual(['users/byId', 2])
  })

  test('forwards TanStack Query cancellation to generated client procedures', async () => {
    const controller = new AbortController()
    let receivedSignal: AbortSignal | undefined
    const requestRoutes = createApi({ plugins: [tanstackQueryPlugin()] })
      .router('request')
      .define(({ procedure }) => ({
        byId: clientProcedure(
          procedure.input(z.number()).handler(async ({ input }) => input),
          async (options, input) => {
            receivedSignal = options.signal
            return input
          }
        ),
      }))

    await expect(requestRoutes.byId.$tanstack.queryOptions(1).queryFn({ signal: controller.signal })).resolves.toBe(1)
    expect(receivedSignal).toBe(controller.signal)
  })
})
