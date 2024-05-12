import { describe, expect, test } from 'vitest'
import { api } from '../src/api'
import { create } from '../src/create'

const a = api()
const router = a.router({ name: 'router', routes: [a.procedure('foo', (num: number) => num)] })

describe('main functionality', () => {
  test('router is initialized with base', () => {
    const a = create(router)
    expect(a.call('foo', 2)).toStrictEqual(2)
    expect(a.routerName).toStrictEqual('router')
    // rest is tested more indepth in rotuer tests
  })
  test('adapters are correctly initialized', () => {
    const a = create(router, { bar: () => (str: string) => str })
    expect(a.bar('hello')).toStrictEqual('hello')
    expect(a.call('foo', 2))
  })
  test('router is propagated to adapter', () => {
    const a = create(router, { foo: (rt) => rt.routerName })
    expect(a.routerName).toStrictEqual('router')
  })
  test('custom context is propagated to adapter', () => {
    const routerWithContext = api({ context: { bar: 'baz' } }).router({
      name: 'router',
      routes: [api().procedure('foo', (num: number) => num)],
    })
    const a = create(routerWithContext, { foo: (rt) => rt.context.bar })
    expect(a.foo).toStrictEqual('baz')
  })
})

describe('corner cases', () => {
  test('adapter with same name as procedure works', () => {
    const a = create(router, { foo: () => (str: string) => str })
    expect(a.foo('hello')).toStrictEqual('hello')
    expect(a.call('foo', 2)).toStrictEqual(2)
  })
  test('adapter works with custom call with same name', () => {
    const a = create(router, { foo: () => (str: string) => str })
    expect(a.foo('bar')).toStrictEqual('bar')
    // @ts-expect-error adapter takes precedence over custom call
    expect(a.foo('bar', 2)).toStrictEqual('bar')
  })
})
