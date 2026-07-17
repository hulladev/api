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
      expectTypeOf(result).returns.toEqualTypeOf<string>()
      expect(result()).toBe('handler')
    })
    test('handler works with nothing passed (async)', async () => {
      const result = builder.handler(async () => 'handler')
      expectTypeOf(result).returns.toEqualTypeOf<Promise<string>>()
      expect(await result()).toBe('handler')
    })
  }
  sharedTests(noMiddleware)
  sharedTests(withMiddleware)

  test('named inputs preserve labels and explicit optional positions', () => {
    const id = z.string()
    const patch = z.object({ name: z.string() })
    const limit = z.number().optional()
    const update = noMiddleware.input
      .$named<[id: typeof id, patch: typeof patch]>(id, patch)
      .handler(({ input }) => input)
    const search = noMiddleware.input
      .$named<[query: typeof id, limit?: typeof limit]>(id, limit)
      .handler(({ input }) => input)

    expectTypeOf(update).parameters.toEqualTypeOf<[id: string, patch: { name: string }]>()
    expectTypeOf(search).parameters.toEqualTypeOf<[query: string, limit?: number | undefined]>()
    expect(update('user_123', { name: 'Samuel' })).toEqual(['user_123', { name: 'Samuel' }])
    expect(search('samuel')).toEqual(['samuel', undefined])
  })
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
      expectTypeOf(result).parameter(0).toEqualTypeOf<string>()
      expectTypeOf(result).returns.toEqualTypeOf<string>()
      expect(result('hulla')).toBe('hulla')
    })
    test('input modifies the handler (async)', async () => {
      const result = builder.input(z.string()).handler(async ({ input }) => input)
      expectTypeOf(result).parameter(0).toEqualTypeOf<string>()
      expectTypeOf(result).returns.toEqualTypeOf<Promise<string>>()
      expect(await result('hulla')).toBe('hulla')
    })
    test('input parses before passing the value to the handler', () => {
      const result = builder
        .input(z.string().transform((value) => value.length))
        .handler(({ input }) => input.toFixed(2))
      expectTypeOf(result).parameter(0).toEqualTypeOf<string>()
      expectTypeOf(result).returns.toEqualTypeOf<string>()
      expect(result('hulla')).toBe('5.00')
      expect(() => result(123 as never)).toThrow()
    })
    test('input throws error if input is not valid', () => {
      const result = builder.input(z.string()).handler(({ input }) => input)
      expect(() => result(123 as never)).toThrow()
    })
    test('input throws error if input is not valid (async)', () => {
      const result = builder.input(z.string()).handler(async ({ input }) => input)
      expect(() => result(123 as never)).toThrow()
    })
    test('input with object schema', () => {
      const result = builder.input(z.object({ name: z.string(), age: z.number() })).handler(({ input }) => input)
      expectTypeOf(result).parameter(0).toEqualTypeOf<{ name: string; age: number }>()
      expectTypeOf(result).returns.toEqualTypeOf<{ name: string; age: number }>()
      expect(result({ name: 'hulla', age: 123 })).toStrictEqual({ name: 'hulla', age: 123 })
    })
    test('input with object schema (async)', async () => {
      const result = builder.input(z.object({ name: z.string(), age: z.number() })).handler(async ({ input }) => input)
      expectTypeOf(result).parameter(0).toEqualTypeOf<{ name: string; age: number }>()
      expectTypeOf(result).returns.toEqualTypeOf<Promise<{ name: string; age: number }>>()
      expect(await result({ name: 'hulla', age: 123 })).toStrictEqual({ name: 'hulla', age: 123 })
    })
    test('a single array schema remains one input argument', () => {
      const result = builder.input(z.array(z.string())).handler(({ input }) => input)

      expectTypeOf(result).parameters.toEqualTypeOf<[string[]]>()
      expect(result(['hulla', 'api'])).toEqual(['hulla', 'api'])
    })
    test('multiple inputs become positional call arguments and a tuple handler input', () => {
      const result = builder
        .input(
          z.string().transform((value) => value.length),
          z.number()
        )
        .handler(({ input }) => input)

      expectTypeOf(result).parameters.toEqualTypeOf<[string, number]>()
      expectTypeOf(result).returns.toEqualTypeOf<readonly [number, number]>()
      expect(result('hulla', 2)).toEqual([5, 2])
      // @ts-expect-error the second input is required
      expect(() => result('hulla')).toThrow()
      // @ts-expect-error extra input arguments are rejected
      expect(() => result('hulla', 2, true as never)).toThrow()
    })
    test('an array can be one position in a multiple-input procedure', () => {
      const result = builder.input(z.array(z.string()), z.number()).handler(({ input }) => input)

      expectTypeOf(result).parameters.toEqualTypeOf<[string[], number]>()
      expect(result(['hulla', 'api'], 2)).toEqual([['hulla', 'api'], 2])
    })
    test('trailing optional input schemas become optional call arguments', () => {
      const result = builder.input(z.string(), z.string().optional()).handler(({ input }) => input)

      expectTypeOf(result).parameters.toEqualTypeOf<[string, (string | undefined)?]>()
      expect(result('hulla')).toEqual(['hulla', undefined])
      expect(result('hulla', 'api')).toEqual(['hulla', 'api'])
    })
    test('optional schemas before required inputs keep their positional slot', () => {
      const result = builder.input(z.string().optional(), z.number()).handler(({ input }) => input)

      expectTypeOf(result).parameters.toEqualTypeOf<[string | undefined, number]>()
      expect(result(undefined, 2)).toEqual([undefined, 2])
    })
    test('distinguishing between optional, default in input and output', () => {
      const schema = z.object({ name: z.string(), age: z.number().default(123), optional: z.string().optional() })
      const result = builder.input(schema).handler(({ input }) => input)
      expectTypeOf(result).parameter(0).pick('name').toEqualTypeOf<{ name: string }>()
      expectTypeOf(result).parameter(0).pick('age').toEqualTypeOf<{ age?: number }>()
      expectTypeOf(result).parameter(0).pick('optional').toEqualTypeOf<{ optional?: string }>()
      expectTypeOf(result).returns.pick('name').toEqualTypeOf<{ name: string }>()
      // ! age coerces to number since it has default
      expectTypeOf(result).returns.pick('age').toEqualTypeOf<{ age: number }>()
      // ! optional stays | undefined since it is optional
      expectTypeOf(result).returns.pick('optional').toEqualTypeOf<{ optional?: string }>()
      expectTypeOf(result).parameter(0).toEqualTypeOf<{ name: string; age?: number; optional?: string }>()
      expectTypeOf(result).returns.toEqualTypeOf<{ name: string; age: number; optional?: string }>()
      expect(result({ name: 'hulla' })).toStrictEqual({ name: 'hulla', age: 123 })
      expect(result({ name: 'hulla', age: 123 })).toStrictEqual({ name: 'hulla', age: 123 })
      expect(result({ name: 'hulla', age: 123, optional: 'hulla' })).toStrictEqual({
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
      expectTypeOf(r1).returns.toEqualTypeOf<string>()
      const r2 = builder.handler(() => 2)
      expectTypeOf(r2).returns.toEqualTypeOf<number>()
      const r3 = builder.handler(() => Promise.resolve('hulla'))
      expectTypeOf(r3).returns.toEqualTypeOf<Promise<string>>()
      const r4 = builder.handler(() => {})
      expectTypeOf(r4).returns.toEqualTypeOf<void>()
    })
    test('output enforces return type', () => {
      const result = builder.output(z.string()).handler(() => 'hulla')
      expectTypeOf(result).returns.toEqualTypeOf<string>()
      // @ts-expect-error output schema expects a string
      const result2 = builder.output(z.string()).handler(() => 2)
      expect(() => result2()).toThrow()
    })
    test('output enforces return type (async)', () => {
      const result = builder.output(z.string()).handler(async () => 'hulla')
      expectTypeOf(() => result()).returns.toEqualTypeOf<Promise<string>>()
    })
    test('output parses the handler result through transformed schemas', () => {
      const result = builder.output(z.string().transform((value) => value.length)).handler(() => 'hello')
      expectTypeOf(result).returns.toEqualTypeOf<number>()
      expect(result()).toBe(5)
    })
    test('output rejects invalid return type (async)', async () => {
      // @ts-expect-error output schema expects a string
      const result = builder.output(z.string()).handler(async () => 2)
      await expect(result()).rejects.toThrow()
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
      expectTypeOf(result).returns.toEqualTypeOf<string>()
      expect(result()).toBe('hulla')
    })
    test('plain output schema rejects async handlers in raw mode', async () => {
      // @ts-expect-error raw output expects the raw handler return to match z.string()
      const result = builder.output(z.string()).handler(async () => 'hulla')
      await expect(Promise.resolve(result())).rejects.toThrow()
    })
    test('promise output schema preserves async handler shape', async () => {
      const result = builder.output(z.promise(z.string())).handler(async () => 'hulla')
      expectTypeOf(result).returns.toEqualTypeOf<Promise<string>>()
      await expect(result()).resolves.toBe('hulla')
    })
    test('awaited mode parses async handler output after resolution', async () => {
      const awaitedBuilder = procedureBuilder({ middleware: {}, settings: { output: 'awaited' as const } })
      const result = awaitedBuilder.output(z.string().transform((value) => value.length)).handler(async () => 'hello')

      expectTypeOf(result).returns.toEqualTypeOf<Promise<number>>()
      await expect(result()).resolves.toBe(5)
    })
    test('promise output schema rejects sync handlers in raw mode at runtime', () => {
      const result = builder.output(z.promise(z.string())).handler(() => 'hulla')
      expect(() => result()).toThrow()
    })
  }
  sharedTests(noMiddleware)
  sharedTests(withMiddleware)
})
