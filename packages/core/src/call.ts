import type { Args, Call, Fn, Resolver } from './types'

export function call<const N extends string, const CN extends string, CTX, A extends Args, const R, const R2 = R>(
  route: N,
  method: CN,
  fn: Fn<A, R>,
  resolver?: Resolver<CTX, R, R2>
): Call<N, CN, CTX, A, R, R2> {
  return {
    route,
    fn,
    resolver,
    method,
  }
}
