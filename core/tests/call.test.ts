import { describe, expect, test } from 'bun:test'
import { expectTypeOf } from 'expect-type'
import { call } from '../src/call'
import type { Call } from '../src/types'

const testCall = call('route', 'call', (id: number) => !!id)

describe('functionality', () => {
  test('call has correct function return', () => {
    expect(testCall.fn(1)).toStrictEqual(true)
    expect(testCall.fn(0)).toStrictEqual(false)
  })
  test('call has correct internal call name', () => {
    expect(testCall.method).toStrictEqual('call')
  })
})

// note these will always pass in a test suite - however they do throw a type error in IDE/build time
// which we can detect in ci/cd
describe('types', () => {
  test('call has correct function type', () => {
    expectTypeOf(testCall.fn).toEqualTypeOf<(id: number) => boolean>()
  })
  test('call has correct return', () => {
    expectTypeOf(testCall.fn).returns.toEqualTypeOf<boolean>()
  })
  test('call has correct internal call name type', () => {
    expectTypeOf(testCall.method).toEqualTypeOf<'call'>()
  })
  test('definitions are explicit (const)', () => {
    expectTypeOf(testCall.method).not.toEqualTypeOf<string>()
  })
  // for some reason ts/ide bugs out on this one treating Call as class instead of type
  // test('call has correct type', () => {
  //   expectTypeOf(testCall).toEqualTypeOf <
  //     Call<'route', [id: number], boolean, 'call', boolean, Context<'call', [id: number], 'route', string>>()
  // })
  test('resolver correctly overrides return type', () => {
    const testCallWithResolver = call(
      'abc',
      'call',
      (id: number) => !!id,
      (r) => (r ? r.toString() : '')
    )
    expect(
      testCallWithResolver.resolver?.(true, {
        // we simulate the passed context from router
        method: 'call',
        type: 'procedure',
        args: [1],
        route: 'abc',
        routerName: 'b',
      })
    ).toStrictEqual('true')
    expectTypeOf(testCallWithResolver).toEqualTypeOf<Call<'abc', 'call', unknown, [id: number], boolean, string>>()
  })
})
