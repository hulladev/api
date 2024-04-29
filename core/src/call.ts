import type { LowercaseMethods } from './constants'
import type { Args, Fn, Methods } from './types'

export type CallNames = Lowercase<Methods> | 'call'
export type Context<N extends string, CN extends string, A extends Args, RR extends string = string> = {
  method: CN
  type: CN extends 'call' ? 'procedure' : CN extends LowercaseMethods ? 'request' : 'custom'
  route: N
  routerName: RR
  args: A
}

export type ResolverArgs<CTX, R> = [R, CTX]

export type Resolver<CTX, R, R2 = R> = Fn<ResolverArgs<CTX, R>, R2>

export type Call<N extends string, CN extends string, CTX, A extends Args, R, R2 = R> = {
  route: N
  fn: Fn<A, R>
  resolver?: Resolver<CTX, R, R2>
  method: CN
}

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
