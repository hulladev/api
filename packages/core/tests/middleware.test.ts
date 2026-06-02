import { describe, expect, expectTypeOf, test } from 'vitest'
import { procedureBuilder } from '../src/procedure'

describe('middleware', () => {
  const syncM = procedureBuilder({ middleware: { foo: () => 'foo', bar: () => 'bar' }, settings: { output: 'raw' as const } })

  test('sync middleware is resolved synchronously', () => {
    const result = syncM.use('foo', 'bar').handler(() => 'handler')
    expectTypeOf(result.call).returns.toEqualTypeOf<string>()
    expect(result.call()).toBe('handler')
  })

  test('getContext returns the resolved context', () => {
    const result = syncM.use('foo', 'bar').handler(({ getContext }) => getContext())
    expectTypeOf(result.call).returns.toEqualTypeOf<{ foo: string; bar: string }>()
    expect(result.call()).toStrictEqual({ foo: 'foo', bar: 'bar' })
  })

  test('sync middleware works in async functions', async () => {
    const result = syncM.use('foo', 'bar').handler(async ({ getContext }) => getContext())
    expectTypeOf(result.call).returns.toEqualTypeOf<Promise<{ foo: string; bar: string }>>()
    expect(await result.call()).toStrictEqual({ foo: 'foo', bar: 'bar' })
  })

  const asyncM = procedureBuilder({
    middleware: { foo: async () => 'foo', bar: async () => 'bar' },
    settings: { output: 'raw' as const },
  })

  test('async middleware is resolved asynchronously', async () => {
    const result = asyncM.use('foo', 'bar').handler(async ({ getContext }) => getContext())
    expectTypeOf(result.call).returns.toEqualTypeOf<Promise<{ foo: string; bar: string }>>()
    expect(await result.call()).toStrictEqual({ foo: 'foo', bar: 'bar' })
  })

  test('getContext returns the resolved context', async () => {
    const result = asyncM.use('foo', 'bar').handler(async ({ getContext }) => getContext())
    expectTypeOf(result.call).returns.toEqualTypeOf<Promise<{ foo: string; bar: string }>>()
    expect(await result.call()).toStrictEqual({ foo: 'foo', bar: 'bar' })
  })

  test('async middleware just returns promise in sync functions', async () => {
    const result = asyncM.use('foo', 'bar').handler(({ getContext }) => getContext())
    expectTypeOf(result.call).returns.toEqualTypeOf<Promise<{ foo: string; bar: string }>>()
    expect(await result.call()).toStrictEqual({ foo: 'foo', bar: 'bar' })
  })

  const combinedM = procedureBuilder({
    middleware: { sync: () => 'foo', async: async () => 'bar' },
    settings: { output: 'raw' as const },
  })

  test('picking only sync functions results in sync context', () => {
    const result = combinedM.use('sync').handler(({ getContext }) => getContext())
    expectTypeOf(result.call).returns.toEqualTypeOf<{ sync: string }>()
    expect(result.call()).toStrictEqual({ sync: 'foo' })
  })

  test('picking only async functions results in async context', async () => {
    const result = combinedM.use('async').handler(({ getContext }) => getContext())
    expectTypeOf(result.call).returns.toEqualTypeOf<Promise<{ async: string }>>()
    expect(await result.call()).toStrictEqual({ async: 'bar' })
  })

  test('picking combined functions results in async context', async () => {
    const result = combinedM.use('sync', 'async').handler(({ getContext }) => getContext())
    expectTypeOf(result.call).returns.toEqualTypeOf<Promise<{ sync: string; async: string }>>()
    expect(await result.call()).toStrictEqual({ sync: 'foo', async: 'bar' })
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
    expect(result.call()).toBe('ok')
    expect(calls).toBe(1)
    expect(result.call()).toBe('ok')
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

    expect(result.call()).toBe('done')
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

    expect(result.call()).toBe('u1')
    expect(calls).toBe(1)
    expect(result.call()).toBe('u2')
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

    const typedResult: () => Promise<string> = result.call
    await expect(result.call()).resolves.toBe('u1')
    expect(calls).toBe(1)
    await expect(result.call()).resolves.toBe('u2')
    expect(calls).toBe(2)
    expectTypeOf(typedResult).toEqualTypeOf<() => Promise<string>>()
  })
})
