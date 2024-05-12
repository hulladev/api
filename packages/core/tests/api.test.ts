import { describe, expect, test } from 'vitest'
import { api } from '../src/api'

// These are general all purpose tests that mainly check user-facing calls behaviour
// the testing of the individual methods is done in separate tests
describe('main functionality', () => {
  test('api initializes correctly', () => {
    const a = api()
    expect(a).toBeDefined()
    expect(a.create).toBeDefined()
    expect(a.procedure).toBeDefined()
    expect(a.router).toBeDefined()
  })
  test('api context is working', () => {
    const context = { hello: 'world' }
    const apiWithContext = api({ context })
    expect(apiWithContext.create).toBeDefined()
    expect(apiWithContext.procedure).toBeDefined()
    expect(apiWithContext.router).toBeDefined()
  })
  test('api router initializes properly', () => {
    const router = api().router({ name: 'test', routes: [api().procedure('a', (id: number) => id.toString())] })
    expect(router).toBeDefined()
    expect(router.call('a', 2)).toStrictEqual('2')
  })
  test('context is accessible within the router', () => {
    const c = api({ context: { hello: 'world' } })
    const router = c.router({
      name: 'a',
      routes: [
        c.procedure(
          'foo',
          () => 'd',
          (_, ctx) => ctx.hello
        ),
      ],
    })
    const a = c.create(router)
    expect(a.call('foo')).toStrictEqual('world')
  })
  test('custom methods work', () => {
    const a = api({
      methods: () => ({
        foo: () => 'bar',
      }),
    })
    expect(a.foo()).toStrictEqual('bar')
  })
  test('custom methods work with context', () => {
    const a = api({
      context: { foo: 'foo' },
      methods: (ctx) => ({
        foo: () => ctx.foo,
      }),
    })
    expect(a.foo()).toStrictEqual('foo')
  })
})
