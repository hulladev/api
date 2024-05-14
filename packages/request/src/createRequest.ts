// this needs to be a curry so we can pass the generic arg

import type { Args, Call, Context, Fn, LowercaseMethods, Resolver } from '@hulla/api'
import { response } from './response'
import type { TypedRequestConfig } from './types'

// without need to specify the rest (which needs to be done by user)
export const createRequest =
  <M extends LowercaseMethods, CTX>(
    method: M // passed by the mapping below
  ) =>
  <
    // the arguments user passes
    const N extends string,
    const U extends string,
    const R extends TypedRequestConfig<M | Uppercase<M>, U> | string | URL | Request,
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
