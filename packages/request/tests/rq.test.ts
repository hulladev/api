import { describe, expect, test } from 'vitest'
import { rq } from '../src/rq'

describe('rq', () => {
  // these tests dont do anything, we just check for types
  test('works with params', () => {
    expect(rq({ url: 'users/:id/f?foo&bar', method: 'GET', params: { id: 1, foo: 'foo', bar: true } }))
  })
  // these tests dont do anything, we just check for types
  test('works with disabled params check', () => {
    expect(
      rq({ url: 'users/:id/f?foo&bar', method: 'GET', checkParams: false, params: { id: 1, foo: 'foo', bar: true } })
    )
    expect(rq({ url: 'users/:id/f?foo&bar', method: 'GET', checkParams: false }))
  })
  // this one actually does something (expects a type error)
  test('raises warning when passing params, but no params arent passed', () => {
    // @ts-expect-error type error on purpose
    expect(rq({ url: 'users/:id', method: 'POST' })).toThrow(TypeError)
  })
})
