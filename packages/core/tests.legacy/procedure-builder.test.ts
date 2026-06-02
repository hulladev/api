import { describe, expect, expectTypeOf, test } from 'vitest'
import { z } from 'zod'
import { procedureBuilder } from '../src/procedure'

describe('procedureBuilder handler', () => {
  test('passes through sync handlers without schemas or middleware', () => {
    const procedure = procedureBuilder({ middleware: {}, settings: { output: 'raw' as const } })
    const handler = procedure.handler(() => 'hello' as const)
    const typedHandler: () => 'hello' = handler

    expect(handler()).toBe('hello')
    expectTypeOf(typedHandler).toEqualTypeOf<() => 'hello'>()
  })

  test('parses input before passing it to the handler', () => {
    const procedure = procedureBuilder({ middleware: {}, settings: { output: 'raw' as const } }).input(
      z.string().transform((value) => value.length)
    )
    const handler = procedure.handler(({ input }) => input.toFixed(2))
    const typedHandler: (input: string) => string = handler

    expect(handler('hulla')).toBe('5.00')
    expectTypeOf(typedHandler).toEqualTypeOf<(input: string) => string>()
    expect(() => handler(123 as never)).toThrow()
  })

  test('parses handler output through the output schema', () => {
    const procedure = procedureBuilder({ middleware: {}, settings: { output: 'raw' as const } }).output(
      z.string().transform((value) => value.length)
    )
    const handler = procedure.handler(() => 'hello')
    const typedHandler: () => number = handler

    expect(handler()).toBe(5)
    expectTypeOf(typedHandler).toEqualTypeOf<() => number>()
  })

  test('runs selected middleware at invocation time, not definition time', () => {
    let calls = 0
    const procedure = procedureBuilder({
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
    expect(procedure()).toBe('ok')
    expect(calls).toBe(1)
    expect(procedure()).toBe('ok')
    expect(calls).toBe(2)
  })

  test('runs selected middleware eagerly even when getContext is unused', () => {
    let calls = 0
    const handler = procedureBuilder({
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

    expect(handler()).toBe('done')
    expect(calls).toBe(1)
  })

  test('returns the same sync context object for repeated getContext calls', () => {
    const handler = procedureBuilder({
      middleware: {
        user: () => ({ id: 'u1' as const }),
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

    expect(handler()).toBe('u1')
  })

  test('returns the same promise for repeated async getContext calls', async () => {
    let calls = 0
    const handler = procedureBuilder({
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
        const context = await first
        return context.user.id
      })
    const typedHandler: () => Promise<string> = handler

    await expect(handler()).resolves.toBe('u1')
    expect(calls).toBe(1)
    await expect(handler()).resolves.toBe('u2')
    expect(calls).toBe(2)
    expectTypeOf(typedHandler).toEqualTypeOf<() => Promise<string>>()
  })

  test('parses async handler output after resolution', async () => {
    const handler = procedureBuilder({ middleware: {}, settings: { output: 'awaited' as const } })
      .output(z.string().transform((value) => value.length))
      .handler(async () => 'hello')
    const typedHandler: () => Promise<number> = handler

    await expect(handler()).resolves.toBe(5)
    expectTypeOf(typedHandler).toEqualTypeOf<() => Promise<number>>()
  })
})
