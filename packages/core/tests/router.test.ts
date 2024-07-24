import { describe, expect, expectTypeOf, test } from 'vitest'
import { z } from 'zod'
import { procedure } from '../src/procedure'
import { router } from '../src/router'

const context = { foo: 'foo' }
describe('main functionality', () => {
  const r = router({
    context,
    parseKey: 'parse',
  })({
    name: 'hello',
    routes: [
      procedure({ context, parseKey: 'parse', group: 'procedure', defaultMethod: 'call', defaultContext: context })(
        'hi'
      )
        .input(() => 'foo')
        .define(({ input }) => !!input),
      procedure({ context, parseKey: 'parse', group: 'procedure', defaultMethod: 'call', defaultContext: context })(
        'args'
      )
        .input((id: number) => id.toString())
        .define(({ input }) => [input]),
      procedure({ context, parseKey: 'parse', group: 'procedure', defaultMethod: 'call', defaultContext: context })(
        'foo',
        'custom'
      )
        .input(z.string())
        .define(({ input }) => !!input),
    ],
  })
  test('name', () => {
    expect(r.name).toStrictEqual('hello')
    expectTypeOf(r.name).toEqualTypeOf<'hello'>()
  })
  test('context', () => {
    expect(r.context).toStrictEqual(context)
    expectTypeOf(r.context).toEqualTypeOf<typeof context>()
  })
  // we'll not go over super indepth in testing calls, as we already test for this in procedure.test.ts
  test('call', () => {
    expect(r.call('hi')).toStrictEqual(true)
    expectTypeOf(r.call('hi')).toEqualTypeOf<boolean>()
    expect(r.call('args', 2)).toStrictEqual(['2'])
    expectTypeOf(r.call('args', 2)).toEqualTypeOf<string[]>()
  })
  test('custom method', () => {
    expect(r.custom('foo', 'true')).toStrictEqual(true)
    expectTypeOf(r.custom('foo', 'true')).toEqualTypeOf<boolean>()
  })
})

// dev note: adapters are tested in the api.test.ts file
// even though adapters are technically part of the router
