import type { Args, Call, Context, Fn, Resolver } from '../../core/src/types'

export type Methods = 'GET' | 'POST' | 'PUT' | 'PATCH' | 'DELETE' | 'OPTIONS' | 'HEAD' | 'CONNECT' | 'TRACE'

export type LowercaseMethods = {
  [K in Methods]: Lowercase<K>
}[Methods]

export type StaticConfig<M extends Methods | LowercaseMethods, Data = unknown, Params = unknown> = Partial<
  RequestInit & { method?: M; data?: Data; params?: Params }
> & { url: URL | string }

export type TypedRequestConfig<M extends LowercaseMethods | Methods, Data = unknown, Params = unknown> =
  Uppercase<M> extends 'HEAD' | 'GET'
    ? StaticConfig<Lowercase<M> | Uppercase<M>, Data, Params> & {
        body?: `ERROR: method ${M} cannot contain a body`
        bodyUsed?: false
      }
    : StaticConfig<Lowercase<M> | Uppercase<M>, Data, Params>

export type RequestMap<CTX> = {
  [M in LowercaseMethods]: <
    const N extends string,
    Data,
    Params,
    const R extends TypedRequestConfig<M | Uppercase<M>, Data, Params> | string | URL,
    A extends Args = [],
    const R2 = Promise<Response>,
  >(
    route: N,
    configOrConfigFn: Fn<A, R> | R,
    resolver?: Resolver<CTX & Context<N, M, A>, R, R2>
  ) => Call<N, M, CTX, A, R, R2>
}

export type URLType = InstanceType<typeof URL>
