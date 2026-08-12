import { describe, expect, expectTypeOf, test } from 'vitest'
import { z } from 'zod'
import { defineProcedures, procedure } from '../src/procedure'
import { response, type RouteResponseBody } from '../src/response'
import { route } from '../src/route'
import { routeInput, routeOutput } from '../src/zod'

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
  test('creates one-off callable procedures from schemas derived from a route', async () => {
    const createUser = procedure
      .input(routeInput(createUserRoute))
      .output(routeOutput(createUserRoute, 201))
      .handler(({ input, context, procedure: metadata }) => {
        expectTypeOf(input.body.createdAt).toEqualTypeOf<Date>()
        expectTypeOf(context).toEqualTypeOf<Readonly<Record<string, never>>>()
        expect(metadata.key).toEqual([])
        return { id: 'user-1', createdAt: input.body.createdAt }
      })
    const createdAt = new Date('2026-08-12T10:00:00.000Z')

    expectTypeOf<Parameters<typeof createUser>>().toEqualTypeOf<
      [
        input: {
          body: {
            createdAt: Date
          }
        },
      ]
    >()
    expectTypeOf<Awaited<ReturnType<typeof createUser>>>().toEqualTypeOf<{
      id: string
      createdAt: Date
    }>()
    expectTypeOf<RouteResponseBody<typeof createUserRoute, 201>>().toEqualTypeOf<{
      id: string
      createdAt: Date
    }>()
    await expect(createUser({ body: { createdAt } })).resolves.toEqual({ id: 'user-1', createdAt })
    expect('$meta' in createUser).toBe(false)
    expect(Object.getOwnPropertySymbols(createUser)).toEqual([])

    const rejectHttpDescriptorsAtCompileTime = () => {
      // @ts-expect-error Procedures accept schemas, not HTTP request descriptors.
      procedure.input(createUserRoute.body)
      // @ts-expect-error Procedures accept schemas, not HTTP response descriptors.
      procedure.output(createUserRoute.responses[201].body)
    }
    expectTypeOf(rejectHttpDescriptorsAtCompileTime).toBeFunction()

    await expect(
      (createUser as (input: unknown) => Promise<unknown>)({ body: { createdAt: 'invalid' } })
    ).rejects.toThrow()
  })

  test('supports inferred outputs when no output descriptor is declared', async () => {
    const displayName = procedure.input(z.object({ first: z.string(), last: z.string() })).handler(({ input }) => {
      return `${input.first} ${input.last}`
    })

    expectTypeOf<Awaited<ReturnType<typeof displayName>>>().toEqualTypeOf<string>()
    await expect(displayName({ first: 'Samuel', last: 'Hulla' })).resolves.toBe('Samuel Hulla')
  })

  test('builds nested callable trees with structural identities', async () => {
    const calls: string[] = []
    const base = defineProcedures({
      context: ({ procedure: metadata }) => ({ prefix: metadata.key.join(':') || 'standalone' }),
    })
    const observe = base.middleware(async (actions, args) => {
      calls.push(`before:${args.procedure.key.join('.')}`)
      expectTypeOf(args.context.prefix).toEqualTypeOf<string>()
      const result = await actions.next()
      calls.push(`after:${args.procedure.key.join('.')}`)
      return result
    })
    const traced = base.use(observe)
    const label = traced
      .input(z.string())
      .output(z.string())
      .handler(({ context, input, procedure: metadata }) => {
        expectTypeOf(context.prefix).toEqualTypeOf<string>()
        expect(metadata.key).toEqual(['users', 'label'])
        return `${context.prefix}:${input}`
      })
    const api = base.build({ users: { label } })

    await expect(api.users.label('user-1')).resolves.toBe('users:label:user-1')
    expect(api.users.label.$meta).toEqual({ kind: 'procedure', key: ['users', 'label'] })
    expectTypeOf(api.users.label.$meta.key).toEqualTypeOf<readonly ['users', 'label']>()
    expect(calls).toEqual(['before:users.label', 'after:users.label'])
    expect(Object.isFrozen(api)).toBe(true)
    expect(Object.isFrozen(api.users)).toBe(true)
    expect(Object.isFrozen(api.users.label)).toBe(true)
    expect(Object.keys(api.users.label)).toEqual([])
    expect(Object.getOwnPropertySymbols(api.users.label)).toEqual([])
  })

  test('types middleware input after an input declaration', async () => {
    const shaped = procedure.input(z.object({ id: z.string() }))
    const observe = shaped.middleware(async (actions, args) => {
      expectTypeOf(args.input).toEqualTypeOf<{ id: string }>()
      return actions.next()
    })
    const read = shaped.use(observe).handler(({ input }) => input.id)

    await expect(read({ id: 'user-1' })).resolves.toBe('user-1')
  })

  test('rejects foreign, duplicate, cyclic, and malformed tree members', () => {
    const first = defineProcedures()
    const second = defineProcedures()
    const local = first.handler(() => 'local')
    const foreign = second.handler(() => 'foreign')

    expect(() => first.build({ foreign })).toThrowError(
      'Procedure "foreign" belongs to a different procedure definition'
    )
    expect(() => first.build({ first: local, nested: { second: local } })).toThrowError(
      'each procedure needs one structural identity'
    )
    expect(() => first.build({ invalid: 1 } as never)).toThrowError(
      'Procedure tree member "invalid" must be a procedure or nested object'
    )

    const cyclic: Record<string, unknown> = {}
    cyclic['nested'] = cyclic
    expect(() => first.build(cyclic as never)).toThrowError('Procedure tree "nested" is already registered at "<root>"')
  })

  test('preserves prototype-like structural keys safely', async () => {
    const base = defineProcedures()
    const operation = base.handler(() => 'safe')
    const api = base.build({ ['__proto__']: { ['constructor']: operation } })

    expect(Object.keys(api)).toEqual(['__proto__'])
    expect(Object.keys(api.__proto__)).toEqual(['constructor'])
    expect(Object.getPrototypeOf(api)).toBe(Object.prototype)
    expect(api.__proto__.constructor.$meta.key).toEqual(['__proto__', 'constructor'])
    await expect(api.__proto__.constructor()).resolves.toBe('safe')
  })

  test('rejects invalid JavaScript authoring values', () => {
    const input = procedure.input as unknown as (value: unknown) => unknown
    const output = procedure.output as unknown as (value: unknown) => unknown
    const middleware = procedure.middleware as unknown as (value: unknown) => unknown
    const build = procedure.build as unknown as (value: unknown) => unknown

    expect(() => input({})).toThrowError('Procedure input must be a Standard Schema')
    expect(() => output({})).toThrowError('Procedure output must be a Standard Schema')
    expect(() => middleware({})).toThrowError('Procedure middleware must be a function')
    expect(() => build([])).toThrowError('Procedure tree must be a plain object')
  })
})
