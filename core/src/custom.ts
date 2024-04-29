import { call, type Resolver } from './call'
import type { Args, Fn } from './types'

export function custom<CTX>() {
  return <const N extends string, const M extends string, A extends Args, const R, const R2 = R>(
    route: N,
    method: M,
    fn: Fn<A, R>,
    resolver?: Resolver<CTX, R, R2>
  ) => call(route, method, fn, resolver)
}
