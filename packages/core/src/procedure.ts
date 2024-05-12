import { call } from './call'
import type { Args, Context, Fn, Resolver } from './types'

// this needs to be a curry so we can pass the generic arg
// without need to specify the rest (which needs to be done by user)
export function procedure<const APIContext>() {
  return <const N extends string, const A extends Args, const R, const R2 = R>(
    route: N,
    fn: Fn<A, R>,
    resolver?: Resolver<APIContext & Context<N, 'call', A>, R, R2>
  ) => {
    // the ctx conversion happens in router (since here we dont have access to args or router name)
    return call(route, 'call', fn, resolver)
  }
}
