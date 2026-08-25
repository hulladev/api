import * as v from 'valibot'
import { describe, expect, expectTypeOf, test } from 'vitest'
import { z } from 'zod'
import { response, routeOutput, type RouteResponseBody } from '../src/contract/response'
import { route } from '../src/contract/route'
import { defineProcedure } from '../src/procedure'
import { validation } from '../src/validation'

const procedure = defineProcedure()

const dateTime = z.codec(z.iso.datetime(), z.date(), {
  decode: (value) => new Date(value),
  encode: (value) => value.toISOString(),
})

const user = z.object({
  id: z.string(),
  createdAt: dateTime,
})

const createUserRoute = route.post('/users', {
  body: z.object({ createdAt: dateTime }),
  responses: {
    201: response.json(user),
  },
})

describe('procedure', () => {
  test('uses Standard Schema without validator configuration', () => {
    expect(defineProcedure()).toHaveProperty('input')
    expect(defineProcedure({})).toHaveProperty('output')
  })

  test('creates synchronous one-off callable procedures from exact route-shaped schemas', () => {
    const createUser = procedure
      .input(z.object({ body: z.object({ createdAt: dateTime }) }))
      .output(routeOutput(createUserRoute, 201))
      .handler(({ input, context }) => {
        expectTypeOf(input.body.createdAt).toEqualTypeOf<Date>()
        expectTypeOf(context).toEqualTypeOf<Readonly<Record<string, never>>>()
        return { id: 'user-1', createdAt: input.body.createdAt.toISOString() }
      })
    const createdAt = '2026-08-12T10:00:00.000Z'

    expectTypeOf<Parameters<typeof createUser>>().toEqualTypeOf<
      [
        input: {
          body: {
            createdAt: string
          }
        },
      ]
    >()
    expectTypeOf<ReturnType<typeof createUser>>().toEqualTypeOf<{
      id: string
      createdAt: Date
    }>()
    expectTypeOf<RouteResponseBody<typeof createUserRoute, 201>>().toEqualTypeOf<{
      id: string
      createdAt: Date
    }>()
    expect(createUser({ body: { createdAt } })).toEqual({ id: 'user-1', createdAt: new Date(createdAt) })
    expect('$meta' in createUser).toBe(false)
    expect(Object.getOwnPropertySymbols(createUser)).toEqual([])

    const rejectHttpDescriptorsAtCompileTime = () => {
      // @ts-expect-error Procedures accept schemas, not HTTP request descriptors.
      procedure.input(createUserRoute.body)
      // @ts-expect-error Procedures accept schemas, not HTTP response descriptors.
      procedure.output(createUserRoute.responses[201].body)
    }
    expectTypeOf(rejectHttpDescriptorsAtCompileTime).toBeFunction()

    let validationError: unknown
    try {
      ;(createUser as unknown as (input: unknown) => unknown)({ body: { createdAt: 'invalid' } })
    } catch (error) {
      validationError = error
    }
    expect(validationError).toMatchObject({
      code: 'schema-validation',
      location: 'input',
      issues: [{ location: 'input' }],
    })
  })

  test('supports inferred synchronous outputs when no output descriptor is declared', () => {
    const displayName = procedure.input(z.object({ first: z.string(), last: z.string() })).handler(({ input }) => {
      return `${input.first} ${input.last}`
    })

    expectTypeOf<ReturnType<typeof displayName>>().toEqualTypeOf<string>()
    expect(displayName({ first: 'Samuel', last: 'Hulla' })).toBe('Samuel Hulla')
  })

  test('exposes exact asynchronous types for async handlers and contexts', async () => {
    const asyncHandler = procedure.handler(async () => 'handler')
    expectTypeOf<ReturnType<typeof asyncHandler>>().toEqualTypeOf<Promise<string>>()
    await expect(asyncHandler()).resolves.toBe('handler')

    const withAsyncContext = defineProcedure({
      context: async () => ({ prefix: 'async' }),
    }).handler(({ context }) => context.prefix)
    expectTypeOf<ReturnType<typeof withAsyncContext>>().toEqualTypeOf<Promise<string>>()
    await expect(withAsyncContext()).resolves.toBe('async')
  })

  test.each([
    {
      name: 'Zod',
      schema: validation.async(
        z.string().refine(async (value) => value.length > 0, { message: 'Expected a non-empty string' })
      ),
    },
    {
      name: 'Valibot',
      schema: validation.async(
        v.pipeAsync(
          v.string(),
          v.checkAsync(async (value) => value.length > 0, 'Expected a non-empty string')
        )
      ),
    },
  ])('preserves asynchronous execution for $name validators', async ({ schema: asyncString }) => {
    const withAsyncValidation = procedure
      .input(asyncString)
      .output(asyncString)
      .handler(({ input }) => input)
    expectTypeOf<ReturnType<typeof withAsyncValidation>>().toEqualTypeOf<Promise<string>>()
    await expect(withAsyncValidation('value')).resolves.toBe('value')
    await expect((withAsyncValidation as (value: string) => Promise<string>)('')).rejects.toMatchObject({
      code: 'schema-validation',
      location: 'input',
    })
  })

  test.each([
    { name: 'Zod', schema: z.object({ id: z.string() }) },
    { name: 'Valibot', schema: v.object({ id: v.string() }) },
  ])('annotates $name input validation failures', ({ schema }) => {
    const read = procedure.input(schema).handler(({ input }) => input)

    expect(() => (read as unknown as (input: unknown) => unknown)({ id: 1 })).toThrowError(
      expect.objectContaining({ code: 'schema-validation', location: 'input' })
    )
  })

  test('keeps synchronous context factories synchronous', () => {
    const withContext = defineProcedure({ context: () => ({ prefix: 'sync' }) }).handler(
      ({ context }) => context.prefix
    )

    expectTypeOf<ReturnType<typeof withContext>>().toEqualTypeOf<string>()
    expect(withContext()).toBe('sync')
  })

  test('types middleware input after an input declaration', async () => {
    const shaped = procedure.input(z.object({ id: z.string() }))
    const observe = shaped.middleware(async ({ input, next }) => {
      expectTypeOf(input).toEqualTypeOf<{ id: string }>()
      return next()
    })
    const read = shaped.use(observe).handler(({ input }) => input.id)

    await expect(read({ id: 'user-1' })).resolves.toBe('user-1')
  })

  test('preserves synchronous execution through synchronous middleware', () => {
    const calls: string[] = []
    const observe = procedure.middleware(({ next }) => {
      calls.push('before')
      const result = next()
      calls.push('after')
      return result
    })
    const operation = procedure.use(observe).handler(() => 'ok')

    expectTypeOf<ReturnType<typeof operation>>().toEqualTypeOf<string>()
    expect(operation()).toBe('ok')
    expect(calls).toEqual(['before', 'after'])
  })

  test('rejects middleware that calls next more than once', async () => {
    let handlerCalls = 0
    const duplicate = procedure.middleware(async ({ next }) => {
      await next()
      return next()
    })
    const operation = procedure.use(duplicate).handler(() => {
      handlerCalls += 1
      return 'ok'
    })

    await expect(operation()).rejects.toThrowError('Procedure middleware called next() more than once')
    expect(handlerCalls).toBe(1)
  })

  test('rejects invalid JavaScript authoring values', () => {
    const input = procedure.input as unknown as (value: unknown) => unknown
    const output = procedure.output as unknown as (value: unknown) => unknown
    const middleware = procedure.middleware as unknown as (value: unknown) => unknown

    expect(() => input({})).toThrowError('Procedure input must be a Standard Schema')
    expect(() => output({})).toThrowError('Procedure output must be a Standard Schema')
    expect(() => middleware({})).toThrowError('Procedure middleware must be a function')
  })
})
