import { call } from './call'
import { METHODS_LOWERCASE } from './constants'
import { response } from './response'
import type { Args, Context, Fn, LowercaseMethods, RequestMap, Resolver, TypedRequestConfig } from './types'

export function request<const CTX>() {
  // this needs to be a curry so we can pass the generic arg
  // without need to specify the rest (which needs to be done by user)
  const createRequest =
    <M extends LowercaseMethods>(
      method: M // passed by the mapping below
    ) =>
    <
      // the arguments user passes
      const N extends string,
      Data,
      Params,
      const R extends TypedRequestConfig<M, Data, Params> | string | URL,
      A extends Args = [],
      const R2 = Promise<Response>,
    >(
      route: N,
      configOrConfigFn: Fn<A, R> | R,
      resolver: Resolver<CTX & Context<N, Lowercase<M>, A>, R, R2> = response
    ) => {
      const configFn = (typeof configOrConfigFn === 'function' ? configOrConfigFn : () => configOrConfigFn) as Fn<A, R>
      return call(
        route,
        method.toLowerCase() as Lowercase<M>,
        // the ctx conversion happens in router (since here we dont have access to args or router name)
        configFn,
        resolver
      )
    }
  return METHODS_LOWERCASE.reduce((acc, method) => {
    // @ts-expect-error dynamic method mapping, the RequestMapType is correct
    acc[method] = createRequest(method)
    return acc
  }, {} as RequestMap<CTX>)
}
