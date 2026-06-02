import { describe, expect, expectTypeOf, test } from 'vitest'
import { z } from 'zod'
import { init } from '../src/api'

describe('api', () => {
  test('exports init as the API factory', () => {
    expect(init()).toHaveProperty('router')
  })

  test('exposes procedure and inherited output settings in meta', () => {
    const api = init()

    expect(api).toHaveProperty('procedure')
    expect(api).toHaveProperty('router')
    expect(api).not.toHaveProperty('use')
    expect(api.$meta.settings.output).toBe('awaited')
    // @ts-expect-error use is not available when no middleware is passed
    expectTypeOf(api.use).toEqualTypeOf<never>()
  })

  test('scopes middleware from the api level without mutating the original api', () => {
    const api = init({
      middleware: {
        auth: () => ({ userId: 'u1' as const }),
      },
    })
    const protectedApi = api.use('auth')
    const viewer = protectedApi.procedure.handler(({ getContext }) => getContext())

    expect(api).toHaveProperty('use')
    expect(protectedApi).not.toHaveProperty('use')
    // @ts-expect-error use is only selectable once at the api level
    expectTypeOf(protectedApi.use).toEqualTypeOf<never>()
    // @ts-expect-error the original api has not selected middleware yet
    api.procedure.handler(({ getContext }) => getContext())

    expectTypeOf(viewer.call).returns.toEqualTypeOf<{ auth: { userId: 'u1' } }>()
    expect(viewer.$meta.middleware).toStrictEqual({
      router: ['auth'],
      procedure: [],
      selected: ['auth'],
    })
    expect(viewer.call()).toStrictEqual({ auth: { userId: 'u1' } })
  })

  test('default output allows async handlers for plain output schemas', async () => {
    const api = init()
    const result = api.procedure.output(z.string()).handler(async () => 'hulla')

    expectTypeOf(result.call).returns.toEqualTypeOf<Promise<string>>()
    await expect(result.call()).resolves.toBe('hulla')
  })

  test('raw output requires exact unawaited output type', () => {
    const api = init({ settings: { output: 'raw' as const } })

    // @ts-expect-error raw output expects an exact string return, not Promise<string>
    api.procedure.output(z.string()).handler(async () => 'hulla')
  })

  test('raw output accepts promise schemas for async handlers', async () => {
    const api = init({ settings: { output: 'raw' as const } })
    const result = api.procedure.output(z.promise(z.string())).handler(async () => 'hulla')

    expectTypeOf(result.call).returns.toEqualTypeOf<Promise<string>>()
    await expect(result.call()).resolves.toBe('hulla')
  })

  test('raw output throws on promise returns when schema expects a plain value', () => {
    const api = init({ settings: { output: 'raw' as const } })
    const result = api.procedure.output(z.string()).handler((async () => 'hulla') as never)

    expect(() => result.call()).toThrow()
  })
})
