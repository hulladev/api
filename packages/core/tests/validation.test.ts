import { describe, expect, expectTypeOf, test } from 'vitest'
import { z } from 'zod'
import { procedureBuilder } from '../src/procedure'

describe('validation with no input/output', () => {
  const noMiddleware = procedureBuilder({ middleware: {}, settings: { output: 'raw' as const } })
  const withMiddleware = procedureBuilder({
    middleware: { sync: () => 'foo', async: async () => 'bar' },
    settings: { output: 'raw' as const },
  })
  const sharedTests = (builder: typeof noMiddleware | typeof withMiddleware) => {
    test('handler works with nothing passed', () => {
      const result = builder.handler(() => 'handler')
      expectTypeOf(result.call).returns.toEqualTypeOf<string>()
      expect(result.call()).toBe('handler')
    })
    test('handler works with nothing passed (async)', async () => {
      const result = builder.handler(async () => 'handler')
      expectTypeOf(result.call).returns.toEqualTypeOf<Promise<string>>()
      expect(await result.call()).toBe('handler')
    })
  }
  sharedTests(noMiddleware)
  sharedTests(withMiddleware)
})

describe('validation with input', () => {
  const noMiddleware = procedureBuilder({ middleware: {}, settings: { output: 'raw' as const } })
  const withMiddleware = procedureBuilder({
    middleware: { sync: () => 'foo', async: async () => 'bar' },
    settings: { output: 'raw' as const },
  })
  const sharedTests = (builder: typeof noMiddleware | typeof withMiddleware) => {
    test('input modifies the handler', () => {
      const result = builder.input(z.string()).handler(({ input }) => input)
      expectTypeOf(result.call).parameter(0).toEqualTypeOf<string>()
      expectTypeOf(result.call).returns.toEqualTypeOf<string>()
      expect(result.call('hulla')).toBe('hulla')
    })
    test('input modifies the handler (async)', async () => {
      const result = builder.input(z.string()).handler(async ({ input }) => input)
      expectTypeOf(result.call).parameter(0).toEqualTypeOf<string>()
      expectTypeOf(result.call).returns.toEqualTypeOf<Promise<string>>()
      expect(await result.call('hulla')).toBe('hulla')
    })
    test('input parses before passing the value to the handler', () => {
      const result = builder
        .input(z.string().transform((value) => value.length))
        .handler(({ input }) => input.toFixed(2))
      expectTypeOf(result.call).parameter(0).toEqualTypeOf<string>()
      expectTypeOf(result.call).returns.toEqualTypeOf<string>()
      expect(result.call('hulla')).toBe('5.00')
      expect(() => result.call(123 as never)).toThrow()
    })
    test('input throws error if input is not valid', () => {
      const result = builder.input(z.string()).handler(({ input }) => input)
      expect(() => result.call(123 as never)).toThrow()
    })
    test('input throws error if input is not valid (async)', () => {
      const result = builder.input(z.string()).handler(async ({ input }) => input)
      expect(() => result.call(123 as never)).toThrow()
    })
    test('input with object schema', () => {
      const result = builder.input(z.object({ name: z.string(), age: z.number() })).handler(({ input }) => input)
      expectTypeOf(result.call).parameter(0).toEqualTypeOf<{ name: string; age: number }>()
      expectTypeOf(result.call).returns.toEqualTypeOf<{ name: string; age: number }>()
      expect(result.call({ name: 'hulla', age: 123 })).toStrictEqual({ name: 'hulla', age: 123 })
    })
    test('input with object schema (async)', async () => {
      const result = builder.input(z.object({ name: z.string(), age: z.number() })).handler(async ({ input }) => input)
      expectTypeOf(result.call).parameter(0).toEqualTypeOf<{ name: string; age: number }>()
      expectTypeOf(result.call).returns.toEqualTypeOf<Promise<{ name: string; age: number }>>()
      expect(await result.call({ name: 'hulla', age: 123 })).toStrictEqual({ name: 'hulla', age: 123 })
    })
    test('distinguishing between optional, default in input and output', () => {
      const schema = z.object({ name: z.string(), age: z.number().default(123), optional: z.string().optional() })
      const result = builder.input(schema).handler(({ input }) => input)
      expectTypeOf(result.call).parameter(0).pick('name').toEqualTypeOf<{ name: string }>()
      expectTypeOf(result.call).parameter(0).pick('age').toEqualTypeOf<{ age?: number }>()
      expectTypeOf(result.call).parameter(0).pick('optional').toEqualTypeOf<{ optional?: string }>()
      expectTypeOf(result.call).returns.pick('name').toEqualTypeOf<{ name: string }>()
      // ! age coerces to number since it has default
      expectTypeOf(result.call).returns.pick('age').toEqualTypeOf<{ age: number }>()
      // ! optional stays | undefined since it is optional
      expectTypeOf(result.call).returns.pick('optional').toEqualTypeOf<{ optional?: string }>()
      expectTypeOf(result.call).parameter(0).toEqualTypeOf<{ name: string; age?: number; optional?: string }>()
      expectTypeOf(result.call).returns.toEqualTypeOf<{ name: string; age: number; optional?: string }>()
      expect(result.call({ name: 'hulla' })).toStrictEqual({ name: 'hulla', age: 123 })
      expect(result.call({ name: 'hulla', age: 123 })).toStrictEqual({ name: 'hulla', age: 123 })
      expect(result.call({ name: 'hulla', age: 123, optional: 'hulla' })).toStrictEqual({
        name: 'hulla',
        age: 123,
        optional: 'hulla',
      })
    })
  }
  sharedTests(noMiddleware)
  sharedTests(withMiddleware)
})

describe('validation with output', () => {
  const noMiddleware = procedureBuilder({ middleware: {}, settings: { output: 'awaited' as const } })
  const withMiddleware = procedureBuilder({
    middleware: { sync: () => 'foo', async: async () => 'bar' },
    settings: { output: 'awaited' as const },
  })
  const sharedTests = (builder: typeof noMiddleware | typeof withMiddleware) => {
    test('no output allows any return value', () => {
      const r1 = builder.handler(() => 'hulla')
      expectTypeOf(r1.call).returns.toEqualTypeOf<string>()
      const r2 = builder.handler(() => 2)
      expectTypeOf(r2.call).returns.toEqualTypeOf<number>()
      const r3 = builder.handler(() => Promise.resolve('hulla'))
      expectTypeOf(r3.call).returns.toEqualTypeOf<Promise<string>>()
      const r4 = builder.handler(() => {})
      expectTypeOf(r4.call).returns.toEqualTypeOf<void>()
    })
    test('output enforces return type', () => {
      const result = builder.output(z.string()).handler(() => 'hulla')
      expectTypeOf(result.call).returns.toEqualTypeOf<string>()
      // @ts-expect-error output schema expects a string
      const result2 = builder.output(z.string()).handler(() => 2)
      expect(() => result2.call()).toThrow()
    })
    test('output enforces return type (async)', () => {
      const result = builder.output(z.string()).handler(async () => 'hulla')
      expectTypeOf(() => result.call()).returns.toEqualTypeOf<Promise<string>>()
    })
    test('output parses the handler result through transformed schemas', () => {
      const result = builder.output(z.string().transform((value) => value.length)).handler(() => 'hello')
      expectTypeOf(result.call).returns.toEqualTypeOf<number>()
      expect(result.call()).toBe(5)
    })
    test('output rejects invalid return type (async)', async () => {
      // @ts-expect-error output schema expects a string
      const result = builder.output(z.string()).handler(async () => 2)
      await expect(result.call()).rejects.toThrow()
    })
  }
  sharedTests(noMiddleware)
  sharedTests(withMiddleware)
})

describe('validation with output in raw mode', () => {
  const noMiddleware = procedureBuilder({ middleware: {}, settings: { output: 'raw' as const } })
  const withMiddleware = procedureBuilder({
    middleware: { sync: () => 'foo', async: async () => 'bar' },
    settings: { output: 'raw' as const },
  })
  const sharedTests = (builder: typeof noMiddleware | typeof withMiddleware) => {
    test('plain output schema stays sync-only', () => {
      const result = builder.output(z.string()).handler(() => 'hulla')
      expectTypeOf(result.call).returns.toEqualTypeOf<string>()
      expect(result.call()).toBe('hulla')
    })
    test('plain output schema rejects async handlers in raw mode', () => {
      // @ts-expect-error raw output expects the raw handler return to match z.string()
      const result = builder.output(z.string()).handler(async () => 'hulla')
      expect(() => result.call()).toThrow()
    })
    test('promise output schema preserves async handler shape', async () => {
      const result = builder.output(z.promise(z.string())).handler(async () => 'hulla')
      expectTypeOf(result.call).returns.toEqualTypeOf<Promise<string>>()
      await expect(result.call()).resolves.toBe('hulla')
    })
    test('awaited mode parses async handler output after resolution', async () => {
      const awaitedBuilder = procedureBuilder({ middleware: {}, settings: { output: 'awaited' as const } })
      const result = awaitedBuilder.output(z.string().transform((value) => value.length)).handler(async () => 'hello')

      expectTypeOf(result.call).returns.toEqualTypeOf<Promise<number>>()
      await expect(result.call()).resolves.toBe(5)
    })
    test('promise output schema rejects sync handlers in raw mode', () => {
      // @ts-expect-error raw output expects z.promise(z.string()) to receive a promise
      const result = builder.output(z.promise(z.string())).handler(() => 'hulla')
      expect(() => result.call()).toThrow()
    })
  }
  sharedTests(noMiddleware)
  sharedTests(withMiddleware)
})
