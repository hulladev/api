import { describe, expect, expectTypeOf, test } from 'vitest'
import { procedureBuilder } from '../src/procedure'

describe('middleware', () => {
  const syncM = procedureBuilder({
    middleware: { foo: () => 'foo', bar: () => 'bar' },
    settings: { output: 'raw' as const },
  })

  test('sync middleware is resolved synchronously', () => {
    const result = syncM.use('foo', 'bar').handler(() => 'handler')
    expectTypeOf(result).returns.toEqualTypeOf<string>()
    expect(result()).toBe('handler')
  })

  test('getContext returns the resolved context', () => {
    const result = syncM.use('foo', 'bar').handler(({ getContext }) => getContext())
    expectTypeOf(result).returns.toEqualTypeOf<{ foo: string; bar: string }>()
    expect(result()).toStrictEqual({ foo: 'foo', bar: 'bar' })
  })

  test('sync middleware works in async functions', async () => {
    const result = syncM.use('foo', 'bar').handler(async ({ getContext }) => getContext())
    expectTypeOf(result).returns.toEqualTypeOf<Promise<{ foo: string; bar: string }>>()
    expect(await result()).toStrictEqual({ foo: 'foo', bar: 'bar' })
  })

  const asyncM = procedureBuilder({
    middleware: { foo: async () => 'foo', bar: async () => 'bar' },
    settings: { output: 'raw' as const },
  })

  test('async middleware is resolved asynchronously', async () => {
    const result = asyncM.use('foo', 'bar').handler(async ({ getContext }) => getContext())
    expectTypeOf(result).returns.toEqualTypeOf<Promise<{ foo: string; bar: string }>>()
    expect(await result()).toStrictEqual({ foo: 'foo', bar: 'bar' })
  })

  test('getContext returns the resolved context', async () => {
    const result = asyncM.use('foo', 'bar').handler(async ({ getContext }) => getContext())
    expectTypeOf(result).returns.toEqualTypeOf<Promise<{ foo: string; bar: string }>>()
    expect(await result()).toStrictEqual({ foo: 'foo', bar: 'bar' })
  })

  test('async middleware just returns promise in sync functions', async () => {
    const result = asyncM.use('foo', 'bar').handler(({ getContext }) => getContext())
    expectTypeOf(result).returns.toEqualTypeOf<Promise<{ foo: string; bar: string }>>()
    expect(await result()).toStrictEqual({ foo: 'foo', bar: 'bar' })
  })

  test('conditional async middleware always exposes an async context type', async () => {
    const conditional = procedureBuilder({
      middleware: {
        session: (): { userId: string } | Promise<{ userId: string }> => Promise.resolve({ userId: 'u1' }),
      },
      settings: { output: 'raw' as const },
    })
    const result = conditional.use('session').handler(({ getContext }) => getContext())

    const typedCall: () => Promise<{ session: { userId: string } }> = result

    expectTypeOf(typedCall).toEqualTypeOf<() => Promise<{ session: { userId: string } }>>()
    await expect(result()).resolves.toStrictEqual({ session: { userId: 'u1' } })
  })

  test('promise-like middleware exposes an async context type', async () => {
    const promiseLike = procedureBuilder({
      middleware: {
        session: (): PromiseLike<{ userId: string }> => Promise.resolve({ userId: 'u1' }),
      },
      settings: { output: 'raw' as const },
    })
    const result = promiseLike.use('session').handler(({ getContext }) => getContext())

    const typedCall: () => Promise<{ session: { userId: string } }> = result

    expectTypeOf(typedCall).toEqualTypeOf<() => Promise<{ session: { userId: string } }>>()
    await expect(result()).resolves.toStrictEqual({ session: { userId: 'u1' } })
  })

  const combinedM = procedureBuilder({
    middleware: { sync: () => 'foo', async: async () => 'bar' },
    settings: { output: 'raw' as const },
  })

  test('picking only sync functions results in sync context', () => {
    const result = combinedM.use('sync').handler(({ getContext }) => getContext())
    expectTypeOf(result).returns.toEqualTypeOf<{ sync: string }>()
    expect(result()).toStrictEqual({ sync: 'foo' })
  })

  test('picking only async functions results in async context', async () => {
    const result = combinedM.use('async').handler(({ getContext }) => getContext())
    expectTypeOf(result).returns.toEqualTypeOf<Promise<{ async: string }>>()
    expect(await result()).toStrictEqual({ async: 'bar' })
  })

  test('picking combined functions results in async context', async () => {
    const result = combinedM.use('sync', 'async').handler(({ getContext }) => getContext())
    expectTypeOf(result).returns.toEqualTypeOf<Promise<{ sync: string; async: string }>>()
    expect(await result()).toStrictEqual({ sync: 'foo', async: 'bar' })
  })

  test('runs selected middleware at invocation time, not definition time', () => {
    let calls = 0
    const result = procedureBuilder({
      middleware: {
        user: () => {
          calls += 1
          return { id: calls }
        },
      },
      settings: { output: 'raw' as const },
    })
      .use('user')
      .handler(() => 'ok')

    expect(calls).toBe(0)
    expect(result()).toBe('ok')
    expect(calls).toBe(1)
    expect(result()).toBe('ok')
    expect(calls).toBe(2)
  })

  test('runs selected middleware even when getContext is unused', () => {
    let calls = 0
    const result = procedureBuilder({
      middleware: {
        user: () => {
          calls += 1
          return { id: calls }
        },
      },
      settings: { output: 'raw' as const },
    })
      .use('user')
      .handler(() => 'done')

    expect(result()).toBe('done')
    expect(calls).toBe(1)
  })

  test('reuses the same sync context object for repeated getContext calls', () => {
    let calls = 0
    const result = procedureBuilder({
      middleware: {
        user: () => {
          calls += 1
          return { id: `u${calls}` as const }
        },
      },
      settings: { output: 'raw' as const },
    })
      .use('user')
      .handler(({ getContext }) => {
        const first = getContext()
        const second = getContext()

        expect(first).toBe(second)
        return first.user.id
      })

    expect(result()).toBe('u1')
    expect(calls).toBe(1)
    expect(result()).toBe('u2')
    expect(calls).toBe(2)
  })

  test('reuses the same promise for repeated async getContext calls', async () => {
    let calls = 0
    const result = procedureBuilder({
      middleware: {
        user: async () => {
          calls += 1
          return { id: `u${calls}` as const }
        },
      },
      settings: { output: 'raw' as const },
    })
      .use('user')
      .handler(async ({ getContext }) => {
        const first = getContext()
        const second = getContext()

        expect(first).toBe(second)
        const [firstContext, secondContext] = await Promise.all([first, second])

        expect(firstContext).toBe(secondContext)
        return firstContext.user.id
      })

    const typedResult: () => Promise<string> = result
    await expect(result()).resolves.toBe('u1')
    expect(calls).toBe(1)
    await expect(result()).resolves.toBe('u2')
    expect(calls).toBe(2)
    expectTypeOf(typedResult).toEqualTypeOf<() => Promise<string>>()
  })

  test('settles earlier middleware promises when a later middleware throws synchronously', async () => {
    let rejectPending!: (reason: unknown) => void
    const pending = new Promise<string>((_resolve, reject) => {
      rejectPending = reject
    })
    const result = procedureBuilder({
      middleware: {
        pending: () => pending,
        broken: () => {
          throw new Error('broken middleware')
        },
      },
      settings: { output: 'raw' as const },
    })
      .use('pending', 'broken')
      .handler(() => 'unreachable')

    expect(() => result()).toThrow('broken middleware')
    rejectPending(new Error('pending rejection'))
    await new Promise((resolve) => setTimeout(resolve, 0))
  })
})
