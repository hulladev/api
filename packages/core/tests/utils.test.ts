import { describe, expect, expectTypeOf, test } from 'vitest'
import { api } from '../src/api'
import { Call, Context } from '../src/types'
import { method } from '../src/utils'

const a = api()

describe('method override', () => {
  test('overrides method value', () => {
    expect(
      method(
        'foo',
        a.procedure('example', () => 'foo')
      ).method
    ).toStrictEqual('foo')
  })
  test('acessible in api', () => {
    const router = a.router({
      name: 'test',
      routes: [
        method(
          'foo',
          a.procedure('example', () => 'foo')
        ),
      ],
    })
    expect(router.foo('example')).toStrictEqual('foo')
  })
})

describe('types', () => {
  test('method type', () => {
    expectTypeOf(
      method(
        'f',
        a.procedure('a', () => 'bar')
      )
    ).toEqualTypeOf<Call<'a', 'f', Context<'a', 'f', readonly []>, readonly [], string, string>>()
  })
})
