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
    expect(api.$meta.settings.output).toBe('awaited')
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
