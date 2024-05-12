import { expectTypeOf } from 'expect-type'
import { describe, expect, test } from 'vitest'
import { api as init } from '../../core/src/index'
import { mutation } from '../src/mutation'
import { router } from './swr.test'

const api = init()
const usersAPI = api.create(router, { mutation })

// Since mutation is implemented by the same function as query, there's no point writing
// separate functional tests for it. The only thing worth checking is wether the returned
// object has been correctly changed from query to mutation

describe('type checks', () => {
  test('request has correct type', () => {
    expectTypeOf(usersAPI.mutation.get('a')).toEqualTypeOf<readonly [['get/users/a'], () => Promise<Response>]>()
  })
  test('no args has correct type and queryKey', () => {
    expectTypeOf(usersAPI.mutation.call('all')).toEqualTypeOf<
      readonly [['call/users/all'], () => { id: number; name: string }[]]
    >()
  })
  test('with args has correct type and queryKey', () => {
    expectTypeOf(usersAPI.mutation.call('byId', 2)).toEqualTypeOf<
      readonly [['call/users/byId', number], () => { id: number; name: string }]
    >()
  })
  test('mutation has access to correct methods', () => {
    // these break typescript with expectTypeOf (even tho they are correct), and matching functions does not work
    // expect(usersAPI.mutation.call).toStrictEqual(
    //   <N extends RouteNamesWithMethod<typeof routes, 'call'>, A extends RouteArgs<typeof routes, 'call', N>>(
    //     route: N,
    //     ...args: A
    //   ) => ({ mutationKey: [`call/users/${route}`, ...args], mutationFn: () => router.invoke('call', route, args) })
    // )
    // expect(usersAPI.mutation.get).resolves.toStrictEqual(
    //   <N extends RouteNamesWithMethod<typeof routes, 'get'>, A extends RouteArgs<typeof routes, 'get', N>>(
    //     route: N,
    //     ...args: A
    //   ) => ({ mutationKey: [`get/users/${route}`, ...args], mutationFn: () => router.invoke('get', route, args) })
    // )
    expect(usersAPI.mutation.call).toBeDefined()
    expect(usersAPI.mutation.call).toBeDefined()
    // @ts-expect-error accessing non-existent method
    expect(usersAPI.mutation.post).toBeUndefined()
  })
})
