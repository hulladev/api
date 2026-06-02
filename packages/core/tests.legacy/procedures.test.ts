import { describe, expect, expectTypeOf, test } from 'vitest'
import { z } from 'zod'
import { api } from '../src/api'
import type {
  MiddlewareContext,
  ProcedureContext,
  ProcedureHandlerArgs,
  ProcedureHandlerReturn,
  ProcedureOutput,
} from '../src/types.private'

describe('procedure private types', () => {
  test('middleware context resolves sync and async middleware contexts', () => {
    const syncContext = undefined as never as MiddlewareContext<() => { foo: 'bar' }>
    const asyncContext = undefined as never as MiddlewareContext<() => Promise<{ foo: 'bar' }>>
    const emptyContext = undefined as never as MiddlewareContext<undefined>

    const typedSyncContext: { foo: 'bar' } = syncContext
    const typedAsyncContext: { foo: 'bar' } = asyncContext
    const typedEmptyContext: {} = emptyContext

    if (false as never) {
      expectTypeOf(typedSyncContext).toEqualTypeOf<{ foo: 'bar' }>()
      expectTypeOf(typedAsyncContext).toEqualTypeOf<{ foo: 'bar' }>()
      expectTypeOf(typedEmptyContext).toEqualTypeOf<{}>()
    }
  })

  test('procedure context resolves merged middleware context', () => {
    const context = undefined as never as ProcedureContext<
      () => { apiOnly: 'api'; shared: 'api' },
      () => { routerOnly: 'router'; shared: 'router' }
    >

    const typedContext: {
      apiOnly: 'api'
      routerOnly: 'router'
      shared: 'router'
    } = context

    if (false as never) {
      expectTypeOf(typedContext).toEqualTypeOf<{
        apiOnly: 'api'
        routerOnly: 'router'
        shared: 'router'
      }>()
    }
  })

  test('handler args include input only when an input schema exists', () => {
    expectTypeOf<ProcedureHandlerArgs<{ ctx: true }, undefined>>().toEqualTypeOf<{ context: { ctx: true } }>()
    expectTypeOf<ProcedureHandlerArgs<{ ctx: true }, ReturnType<typeof z.string>>>().toEqualTypeOf<{
      context: { ctx: true }
      input: string
    }>()
  })

  test('handler return and output preserve sync and async shapes', () => {
    const outputSchema = z.number().transform((value) => value.toFixed(2))

    expectTypeOf<ProcedureHandlerReturn<typeof outputSchema, number>>().toEqualTypeOf<number>()
    expectTypeOf<ProcedureHandlerReturn<typeof outputSchema, Promise<number>>>().toEqualTypeOf<Promise<number>>()
    expectTypeOf<ProcedureOutput<typeof outputSchema, number>>().toEqualTypeOf<string>()
    expectTypeOf<ProcedureOutput<typeof outputSchema, Promise<number>>>().toEqualTypeOf<Promise<string>>()
  })
})

describe('procedures', () => {
  test('exposes typed procedure methods and metadata', async () => {
    const instance = api()
    const router = instance.router({
      name: 'users',
      routes: (route) => ({
        hello: route.procedure({
          handler: () => 'hello' as const,
        }),
        byId: route.procedure({
          input: z.string(),
          handler: ({ input }) => input.length,
        }),
        formattedLength: route.procedure({
          input: z.string(),
          output: z.number().transform((value) => value.toFixed(2)),
          handler: ({ input }) => input.length,
        }),
        asyncHello: route.procedure({
          handler: async () => 'async hello' as const,
        }),
      }),
    })

    expect(router.$meta.name).toBe('users')
    const routerName: 'users' = router.$meta.name

    expect(router.hello()).toBe('hello')
    const hello: 'hello' = router.hello()

    expect(router.byId('abcd')).toBe(4)
    const byId: number = router.byId('abcd')

    expect(router.formattedLength('abcd')).toBe('4.00')
    const formattedLength: string = router.formattedLength('abcd')

    await expect(router.asyncHello()).resolves.toBe('async hello')
    const asyncHello: Promise<'async hello'> = router.asyncHello()

    if (false as never) {
      expectTypeOf(routerName).toEqualTypeOf<'users'>()
      expectTypeOf(hello).toEqualTypeOf<'hello'>()
      expectTypeOf(byId).toEqualTypeOf<number>()
      expectTypeOf(formattedLength).toEqualTypeOf<string>()
      expectTypeOf(asyncHello).toEqualTypeOf<Promise<'async hello'>>()
      // @ts-expect-error hello does not accept an input argument
      router.hello('extra')
      // @ts-expect-error byId requires a string input
      router.byId(123)
    }
  })

  test('omits input from handler args when there is no input schema', () => {
    const instance = api()
    instance.router({
      name: 'contextOnly',
      routes: (route) => ({
        ok: route.procedure({
          handler: ({ context }) => context,
        }),
      }),
    })
  })

  test('merges api and router middleware into handler context', () => {
    const instance = api({
      middleware: () => ({
        apiOnly: 'api' as const,
        shared: 'api' as const,
      }),
    })
    const routerMiddleware = () => ({
      routerOnly: 'router' as const,
      shared: 'router' as const,
    })

    const router = instance.router({
      name: 'merged',
      middleware: routerMiddleware,
      routes: (route) => ({
        mergedContext: route.procedure({
          handler: ({ context }) => context,
        }),
      }),
    })

    expect(router.mergedContext()).toStrictEqual({
      apiOnly: 'api',
      routerOnly: 'router',
      shared: 'router',
    })
  })

  test('becomes async when merged middleware is async', async () => {
    const instance = api({
      middleware: async () => ({
        prefix: 'hello' as const,
      }),
    })

    const router = instance.router({
      name: 'async-context',
      routes: (route) => ({
        greet: route.procedure({
          handler: ({ context }) => `${context.prefix} world` as const,
        }),
      }),
    })

    await expect(router.greet()).resolves.toBe('hello world')
    const greet: Promise<'hello world'> = router.greet()

    if (false as never) {
      expectTypeOf(greet).toEqualTypeOf<Promise<'hello world'>>()
    }
  })

  test('requires the handler return to match the output schema input type', () => {
    const instance = api()

    instance.router({
      name: 'valid-output',
      routes: (route) => ({
        valid: route.procedure({
          output: z.number().transform((value) => value.toFixed(2)),
          handler: () => 2,
        }),
      }),
    })

    instance.router({
      name: 'invalid-output',
      routes: (route) => ({
        invalid: route.procedure({
          output: z.string(),
          // @ts-expect-error output schema expects the handler to return a string
          handler: () => 2,
        }),
      }),
    })
  })

  test('validates schema input at runtime', () => {
    const instance = api()
    const router = instance.router({
      name: 'schema-input',
      routes: (route) => ({
        parseNumber: route.procedure({
          input: z.number(),
          handler: ({ input }) => input.toString(),
        }),
      }),
    })

    expect(router.parseNumber(2)).toBe('2')

    if (false as never) {
      // @ts-expect-error parseNumber only accepts numbers
      router.parseNumber('2')
    }

    expect(() => router.parseNumber('2' as never)).toThrow()
  })

  test('validates schema output at runtime', () => {
    const instance = api()
    const router = instance.router({
      name: 'schema-output',
      routes: (route) => ({
        ok: route.procedure({
          output: z.number().max(2),
          handler: () => 1,
        }),
        bad: route.procedure({
          output: z.number().max(2),
          handler: () => 3,
        }),
      }),
    })

    expect(router.ok()).toBe(1)
    expect(() => router.bad()).toThrow()
  })
})
