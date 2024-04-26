import type { Context } from '@/core/src/call'
import { describe, expect, test } from 'bun:test'
import { expectTypeOf } from 'expect-type'
import { procedure } from '../../core/src/procedure'

const ctx: Context<'foo', 'call', [id: number], 'router'> = {
  method: 'call',
  type: 'procedure',
  route: 'foo',
  routerName: 'router',
  args: [1],
}

const testProcedure = procedure('foo')((id: number) => !!id)
const withResolver = procedure<typeof ctx, 'foo'>('foo')(
  (id: number) => id,
  // note the ctx will be passed from router in practice, but here in unit test we mock it
  (id) => ({ id, ctx })
)

// there's a big overlap with the call() tests, so we're keeping this brief

describe('functionality', () => {
  test('procedure has correct function return', () => {
    expect(testProcedure.fn(1)).toStrictEqual(true)
    expect(testProcedure.fn(0)).toStrictEqual(false)
    expect(withResolver.fn(1)).toStrictEqual(1)
  })
  test('procedure has correct internal call name', () => {
    expect(testProcedure.method).toStrictEqual('call')
    expect(withResolver.method).toStrictEqual('call')
  })
})

// note these will always pass in a test suite - however they do throw a type error in IDE/build time
// which we can detect in ci/cd
describe('types', () => {
  test('procedure has correct function type', () => {
    expectTypeOf(testProcedure.fn).toEqualTypeOf<(id: number) => boolean>()
    expectTypeOf(withResolver.fn).toEqualTypeOf<(id: number) => number>()
  })
  test('procedure has correct return', () => {
    expectTypeOf(testProcedure.fn).returns.toEqualTypeOf<boolean>()
    expectTypeOf(withResolver.fn).returns.toEqualTypeOf<number>()
  })
  test('procedure has correct internal call name type', () => {
    expectTypeOf(testProcedure.method).toEqualTypeOf<'call'>()
  })
  test('the context has correct type', () => {
    expectTypeOf(withResolver.resolver)
      .parameter(1)
      .toEqualTypeOf<Context<'foo', 'call', [id: number], 'router'> & Context<'foo', 'call', readonly [id: number]>>()
  })
})

describe('advanced functionality', () => {
  test('resolver works correctly', () => {
    expect(
      // we mocked the passed context here - this will be passed from the router in practice
      withResolver.resolver?.(withResolver.fn(1), ctx)
    ).toStrictEqual({ id: 1, ctx })
  })
})
