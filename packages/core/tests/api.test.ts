import { describe, expect, expectTypeOf, test } from 'vitest'
import { z } from 'zod'
import { api } from '../src/api'

describe('api', () => {
  test('exposes procedure and inherited output settings in meta', () => {
    const h = api()

    expect(h).toHaveProperty('procedure')
    expect(h).toHaveProperty('router')
    expect(h.$meta.settings.output).toBe('raw')
  })

  test('awaited output allows async handlers for plain output schemas', async () => {
    const h = api({ settings: { output: 'awaited' as const } })
    const result = h.procedure.output(z.string()).handler(async () => 'hulla')

    expectTypeOf(result.call).returns.toEqualTypeOf<Promise<string>>()
    await expect(result.call()).resolves.toBe('hulla')
  })

  test('raw output requires exact unawaited output type', () => {
    const h = api()

    // @ts-expect-error raw output expects an exact string return, not Promise<string>
    h.procedure.output(z.string()).handler(async () => 'hulla')
  })

  test('raw output accepts promise schemas for async handlers', async () => {
    const h = api({ settings: { output: 'raw' as const } })
    const result = h.procedure.output(z.promise(z.string())).handler(async () => 'hulla')

    expectTypeOf(result.call).returns.toEqualTypeOf<Promise<string>>()
    await expect(result.call()).resolves.toBe('hulla')
  })

  test('raw output throws on promise returns when schema expects a plain value', () => {
    const h = api({ settings: { output: 'raw' as const } })
    const result = h.procedure.output(z.string()).handler((async () => 'hulla') as never)

    expect(() => result.call()).toThrow()
  })
})
