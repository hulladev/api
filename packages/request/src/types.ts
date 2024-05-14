import type { Args, Call, Context, Fn, Resolver, TypeError } from '@hulla/api'

export type Methods = 'GET' | 'POST' | 'PUT' | 'PATCH' | 'DELETE' | 'OPTIONS' | 'HEAD' | 'CONNECT' | 'TRACE'

export type LowercaseMethods = {
  [K in Methods]: Lowercase<K>
}[Methods]

/* eslint-disable @typescript-eslint/ban-types */
// needs to be a {} over never, otherwise it messes up the intersection
// since object & Record<stirng, never> equals never, but object & {} equals object
export type StaticConfig<
  M extends Methods | LowercaseMethods,
  U extends string = string,
  P extends boolean = true,
> = Partial<RequestInit & { method?: M; data?: unknown; checkParams?: P; params?: Record<string, URICompoent> }> & {
  readonly url: U
} & (Uppercase<M> extends 'HEAD' | 'GET'
    ? {
        body?: TypeError<
          `ERROR: method "${M}" cannot contain a body`,
          'https://developer.mozilla.org/en-US/docs/Web/API/Request/body'
        >
      }
    : {})

export type TypedRequestConfig<
  M extends LowercaseMethods | Methods,
  U extends string = string,
  P extends boolean = true,
> = StaticConfig<M, U, P> &
  (P extends true
    ? U extends string
      ? HasPath<U> extends never
        ? ParseSearch<U> extends never
          ? {}
          : { params: URLToParams<U> }
        : { params: URLToParams<U> }
      : {}
    : {})

export type RequestMap<CTX> = {
  [M in LowercaseMethods]: <
    const N extends string,
    const R extends TypedRequestConfig<M | Uppercase<M>> | string | URL | Request,
    A extends Args = [],
    const R2 = Promise<Response>,
  >(
    route: N,
    configOrConfigFn: Fn<A, R> | R,
    resolver?: Resolver<CTX & Context<N, M, A>, R, R2>
  ) => Call<N, M, CTX, A, R, R2>
}

export type URLType = InstanceType<typeof URL>

export type ExtractUrl<U> = U extends { url: string } | string ? (U extends { url: string } ? U['url'] : U) : never

export type URICompoent = string | number | boolean

export type ParsePath<U extends string | { url: string }> =
  ExtractUrl<U> extends `${string}/:${infer Param}/${infer Rest}`
    ? { [K in Param]: URICompoent } & ParsePath<Rest>
    : ExtractUrl<U> extends `${string}/:${infer Param}`
      ? { [K in Param]: URICompoent }
      : // eslint-disable-next-line @typescript-eslint/ban-types
        {} // needs to be a {} over never, otherwise it messes up the intersection since {} & never, which we don't want in recursive loop

// same as above, but returns never when not containing any - useful for checks, but breaks recursion / intersection
type HasPath<U extends string | { url: string }> =
  ExtractUrl<U> extends `${string}/:${infer Param}/${infer Rest}`
    ? { [K in Param]: URICompoent } & ParsePath<Rest>
    : ExtractUrl<U> extends `${string}/:${infer Param}`
      ? { [K in Param]: URICompoent }
      : never

export type ParseSearch<U extends string | { url: string }> =
  ExtractUrl<U> extends `${string}?${infer Params}`
    ? Params extends `${infer Key}&${infer Rest}`
      ? { [K in Key]: URICompoent } & ParseSearch<`?${Rest}`>
      : Params extends `${infer Key}`
        ? { [K in Key]: URICompoent }
        : never
    : never

// Since the intersections produce types like { users: string } & { users: string } & { id: string }
// due the circular nature of the URLToParamsInternal, we tidy it up with an object mapping here
// to remove any type duplicties
export type URLToParams<U extends string | { url: string }> = U extends { url: string } | string
  ? {
      [K in keyof ParsePath<U>]: ParsePath<U>[K]
    } & {
      [K in keyof ParseSearch<U>]: ParseSearch<U>[K]
    }
  : never

export type Callables<T> = {
  [K in keyof T]: T[K] extends (...args: any[]) => any ? K : never
}[keyof T]
