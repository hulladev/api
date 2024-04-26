import { call, type Context, type Resolver } from './call'
import type { Args, Fn } from './types'

// this needs to be a curry so we can pass the generic arg
// without need to specify the rest (which needs to be done by user)
export function procedure<const APIContext, const N extends string>(route: N) {
  return <const A extends Args, const R, const R2 = R>(
    fn: Fn<A, R>,
    resolver?: Resolver<APIContext & Context<N, 'call', A>, R, R2>
  ) => {
    // the ctx conversion happens in router (since here we dont have access to args or router name)
    return call(route, 'call', fn, resolver)
  }
}