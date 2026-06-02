import { describe, expect, expectTypeOf, test } from 'vitest'
import { createMiddleware } from '../src/helpers/middleware'
import { defaultValidator } from '../src/helpers/validator'
import { routerCreator } from '../src/router'

describe('createMiddleware', () => {
  test('returns undefined when neither middleware is provided', () => {
    const middleware = createMiddleware()

    expect(middleware).toBeUndefined()
    expectTypeOf(middleware).toEqualTypeOf<undefined>()
  })

  test('returns group middleware unchanged when api middleware is missing', () => {
    const groupMiddleware = () => ({ group: 'group' as const })

    const middleware = createMiddleware(undefined, groupMiddleware)

    expect(middleware).toBe(groupMiddleware)
    expect(middleware?.()).toStrictEqual({ group: 'group' })
    expectTypeOf(middleware).toEqualTypeOf<typeof groupMiddleware>()
  })

  test('returns api middleware unchanged when group middleware is missing', () => {
    const apiMiddleware = () => ({ api: 'api' as const })

    const middleware = createMiddleware(apiMiddleware, undefined)

    expect(middleware).toBe(apiMiddleware)
    expect(middleware?.()).toStrictEqual({ api: 'api' })
    expectTypeOf(middleware).toEqualTypeOf<typeof apiMiddleware>()
  })

  test('merges synchronous api and group middleware and prefers group keys', () => {
    const middleware = createMiddleware(
      () => ({
        apiOnly: 'api-only' as const,
        shared: 'api' as const,
      }),
      () => ({
        groupOnly: 'group-only' as const,
        shared: 'group' as const,
      })
    )

    expect(middleware).toBeTypeOf('function')
    const merged: {
      apiOnly: 'api-only'
      groupOnly: 'group-only'
      shared: 'group'
    } = middleware!()

    expect(merged).toStrictEqual({
      apiOnly: 'api-only',
      groupOnly: 'group-only',
      shared: 'group',
    })
  })

  test('returns async middleware when group middleware is async', async () => {
    const middleware = createMiddleware(
      () => ({
        apiOnly: 'api-only' as const,
        shared: 'api' as const,
      }),
      async () => ({
        groupOnly: 'group-only' as const,
        shared: 'group' as const,
      })
    )

    const merged: Promise<{
      apiOnly: 'api-only'
      groupOnly: 'group-only'
      shared: 'group'
    }> = middleware!()

    await expect(merged).resolves.toStrictEqual({
      apiOnly: 'api-only',
      groupOnly: 'group-only',
      shared: 'group',
    })
  })

  test('returns async middleware when api middleware is async', async () => {
    const middleware = createMiddleware(
      async () => ({
        apiOnly: 'api-only' as const,
        shared: 'api' as const,
      }),
      () => ({
        groupOnly: 'group-only' as const,
        shared: 'group' as const,
      })
    )

    const merged: Promise<{
      apiOnly: 'api-only'
      groupOnly: 'group-only'
      shared: 'group'
    }> = middleware!()

    await expect(merged).resolves.toStrictEqual({
      apiOnly: 'api-only',
      groupOnly: 'group-only',
      shared: 'group',
    })
  })

  test('returns async middleware when both middleware are async', async () => {
    const middleware = createMiddleware(
      async () => ({
        apiOnly: 'api-only' as const,
        shared: 'api' as const,
      }),
      async () => ({
        groupOnly: 'group-only' as const,
        shared: 'group' as const,
      })
    )

    await expect(middleware?.()).resolves.toStrictEqual({
      apiOnly: 'api-only',
      groupOnly: 'group-only',
      shared: 'group',
    })
  })

  test('throws when a supposedly synchronous branch returns a promise', () => {
    const sneakyApiMiddleware = (() => Promise.resolve({ apiOnly: 'api-only' as const })) as unknown as () => {
      apiOnly: 'api-only'
    }

    const middleware = createMiddleware(sneakyApiMiddleware, () => ({ groupOnly: 'group-only' as const }))

    expect(() => middleware?.()).toThrow('Synchronous middleware must not return a Promise.')
  })

  test('router metadata exposes the merged middleware as a function type', () => {
    const router = routerCreator({
      validator: defaultValidator,
      middleware: () => ({
        apiOnly: 'api-only' as const,
        shared: 'api' as const,
      }),
    })({
      name: 'test',
      routes: () => ({}),
      middleware: () => ({
        routerOnly: 'router-only' as const,
        shared: 'router' as const,
      }),
    })

    const merged: () => {
      apiOnly: 'api-only'
      routerOnly: 'router-only'
      shared: 'router'
    } = router.$meta.middleware.merged

    expect(merged()).toStrictEqual({
      apiOnly: 'api-only',
      routerOnly: 'router-only',
      shared: 'router',
    })
  })
})
