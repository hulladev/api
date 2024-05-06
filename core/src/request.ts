import { call } from './call'
import { response } from './response'
import type { Args, Context, Fn, LowercaseMethods, Methods, Resolver, TypedRequestConfig } from './types'

export function request<const CTX>() {
  // this needs to be a curry so we can pass the generic arg
  // without need to specify the rest (which needs to be done by user)
  return function createRequest<
    const N extends string,
    const M extends Methods | LowercaseMethods,
    Data,
    Params,
    const R extends TypedRequestConfig<M, Data, Params> | string | URL,
    A extends Args = [],
    const R2 = Promise<Response>,
  >(
    route: N,
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
