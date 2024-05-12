import type { Args, Call, Context, Fn, Resolver } from '@hulla/api'
import { METHODS_LOWERCASE } from './constants'
import { response } from './response'
import type { LowercaseMethods, RequestMap, TypedRequestConfig } from './types'

// eslint-disable-next-line @typescript-eslint/no-unused-vars
export function request<const CTX>(_ctx?: CTX) {
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
      resolver: Resolver<CTX & Context<N, M, A>, R, R2> = response
    ): Call<N, M, CTX & Context<N, M, A>, A, R, R2> => {
      const configFn = (typeof configOrConfigFn === 'function' ? configOrConfigFn : () => configOrConfigFn) as Fn<A, R>
      return {
        route,
        method: method.toLowerCase() as M,
        fn: configFn,
        resolver,
      }
    }
  return METHODS_LOWERCASE.reduce((acc, method) => {
    // @ts-expect-error dynamic method mapping, the RequestMapType is correct
    acc[method] = createRequest(method)
    return acc
  }, {} as RequestMap<CTX>)
}
