import { api } from '@/core/src/api'
import { describe, expect, test } from 'bun:test'

// These are general all purpose tests that mainly check user-facing calls behaviour
// the testing of the individual methods is done in separate tests
describe('main functionality', () => {
  test('api initializes correctly', () => {
    expect(api).toBeDefined()
    expect(api.create).toBeDefined()
    expect(api.context).toBeDefined()
    expect(api.route).toBeDefined()
    expect(api.router).toBeDefined()
  })
  test('api context is working', () => {
    const ctx = { hello: 'world' }
    const apiWithContext = api.context(ctx)
    expect(apiWithContext.create).toBeDefined()
    expect(apiWithContext.route).toBeDefined()
    expect(apiWithContext.router).toBeDefined()
    // @ts-expect-error The context method should not be available to prevent .context.context chains
    expect(apiWithContext.context).toBeUndefined()
  })
  test('api router initializes properly', () => {
    const router = api.router(
      'test',
      api.route('a').procedure((id: number) => id.toString())
    )
    expect(router).toBeDefined()
    expect(router.call('a', 2)).toStrictEqual('2')
  })
  test('context is accessible within the router', () => {
    const c = api.context({ hello: 'world' })
    const router = c.router(
      'a',
      c.route('foo').procedure(
        () => 'd',
        (_, ctx) => ctx.hello
      )
    )
    const a = c.create(router)
    expect(a.call('foo')).toStrictEqual('world')
  })
})