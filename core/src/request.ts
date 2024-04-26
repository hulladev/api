import { call, type Context, type Resolver } from './call'
import { type LowercaseMethods } from './constants'
import { response } from './response'
import type { Args, Fn, Methods } from './types'

type StaticConfig<M extends Methods | LowercaseMethods, Data = unknown, Params = unknown> = Partial<
  RequestInit & { method?: M; data?: Data; params?: Params }
> & { url: URL | string }
export type TypedRequestConfig<M extends LowercaseMethods | Methods, Data = unknown, Params = unknown> =
  Uppercase<M> extends 'HEAD' | 'GET'
    ? StaticConfig<Lowercase<M> | Uppercase<M>, Data, Params> & {
        body?: `ERROR: method ${M} cannot contain a body`
        bodyUsed?: false
      }
    : StaticConfig<Lowercase<M> | Uppercase<M>, Data, Params>

export function request<const CTX, const N extends string>(route: N) {
  // this needs to be a curry so we can pass the generic arg
  // without need to specify the rest (which needs to be done by user)
  return function createRequest<
    M extends Methods | LowercaseMethods,
    Data,
    Params,
    const R extends TypedRequestConfig<M, Data, Params> | string | URL,
    A extends Args = [],
    const R2 = Promise<Response>,
  >(
    method: M,
    configOrConfigFn: Fn<A, R> | R,
    resolver: Resolver<CTX & Context<N, Lowercase<M>, A>, R, R2> = response
  ) {
    const configFn = (typeof configOrConfigFn === 'function' ? configOrConfigFn : () => configOrConfigFn) as Fn<A, R>
    return call(
      route,
      method.toLowerCase() as Lowercase<M>,
      // the ctx conversion happens in router (since here we dont have access to args or router name)
      configFn,
      resolver
    )
  }
}
