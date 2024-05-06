/* -------------------------------------------------------------------------- */
/*                         calls, procedures, requests                        */
/* -------------------------------------------------------------------------- */
export type Args = readonly unknown[]
export type Methods = 'GET' | 'POST' | 'PUT' | 'PATCH' | 'DELETE' | 'OPTIONS' | 'HEAD' | 'CONNECT' | 'TRACE'
export type Fn<A extends Args, R> = (...args: A) => R
export type FnShape = <A extends Args, R>(...args: A) => R

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

export type ParsedRequestRoute<N extends string> = N extends `${infer M}${infer Rest}`
  ? M extends Methods
    ? [Lowercase<M>, Rest]
    : M extends LowercaseMethods
      ? [M, Rest]
      : ParsedRequestRoute<Rest>
  : never

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

/* -------------------------------------------------------------------------- */
/*                                    util                                    */
/* -------------------------------------------------------------------------- */
export type ArrayContains<T extends readonly unknown[], U> = U extends T[number] ? true : false
export type ArrayToTuple<T extends readonly unknown[]> = { [K in keyof T]: T[K] }
export type Obj = Record<string, unknown>

export type URLType = InstanceType<typeof URL>

/* -------------------------------------------------------------------------- */
/*                                  constants                                 */
/* -------------------------------------------------------------------------- */
export type MethodsArray = readonly Methods[]
export type LowercaseMethods = {
  [K in Methods]: Lowercase<K>
}[Methods]

/* -------------------------------------------------------------------------- */
/*                                   router                                   */
/* -------------------------------------------------------------------------- */
// params extenders
export type Route = Call<string, string, any, any, any, any>
export type RouterShape = readonly Route[]
// util for extracting route names and methods
export type RouteNames<Routes extends RouterShape> = Routes[number]['route']
export type AvailableCalls<Routes extends RouterShape> = Routes[number]['method']
// returns a { [method]: { [route]: Call } } nested type map
export type MappedRouter<Routes extends RouterShape> = {
  [M in AvailableCalls<Routes>]: {
    [N in RouteNamesWithMethod<Routes, M>]: Find<Routes, M, N>
  }
}
// array map which validates the router tuple format
export type RouterMap<Routes extends RouterShape> = Routes extends readonly [
  Call<infer N, infer M, infer CTX, infer A, infer R, infer R2>,
  ...infer Rest,
]
  ? [Call<N, M, CTX, A, R, R2>, ...(Rest extends RouterShape ? RouterMap<Rest> : [])]
  : []
// util for filtering calls by method
export type FilterMethod<Routes extends RouterShape, M extends AvailableCalls<Routes>> =
  RouterMap<Routes> extends [Call<infer N, infer Method, infer CTX, infer A, infer R, infer R2>, ...infer Rest]
    ? Method extends M
      ? [Call<N, M, CTX, A, R, R2>, ...(Rest extends RouterShape ? FilterMethod<Rest, M> : [])]
      : Rest extends RouterShape
        ? FilterMethod<Rest, M>
        : []
    : []
// util for finding a specific call names
export type RouteNamesWithMethod<Routes extends RouterShape, M extends AvailableCalls<Routes>> = FilterMethod<
  Routes,
  M
>[number]['route']
// util for finding a specific call
export type Find<
  Routes extends RouterShape,
  M extends AvailableCalls<Routes>,
  N extends RouteNamesWithMethod<Routes, M>,
> =
  FilterMethod<Routes, M> extends [infer C, ...infer Rest]
    ? C extends Call<N, M, any, any, any, any>
      ? C
      : Rest extends RouterShape
        ? Find<Rest, M, N>
        : never
    : never
// extract fn/resolver args and returns
export type RouteArgs<
  Routes extends RouterShape,
  M extends AvailableCalls<Routes>,
  N extends RouteNamesWithMethod<Routes, M>,
> = Find<Routes, M, N> extends Call<string, string, any, infer A, any, any> ? A : never
export type RouteReturn<
  Routes extends RouterShape,
  M extends AvailableCalls<Routes>,
  N extends RouteNamesWithMethod<Routes, M>,
> = Find<Routes, M, N> extends Call<string, string, any, any, any, infer R2> ? R2 : never
// maps individual methods to the router
export type InvokerMap<Routes extends RouterShape> = {
  [M in AvailableCalls<Routes>]: <N extends RouteNamesWithMethod<Routes, M>>(
    name: N,
    ...args: RouteArgs<Routes, M, N>
  ) => RouteReturn<Routes, M, N>
}
// router type exposed to adapters
export type RouterAdapter<Routes extends RouterShape, RouterName extends string, CTX> = InvokerMap<Routes> & {
  context: CTX
  routeNames: RouteNames<Routes>[]
  routerName: RouterName
  methods: AvailableCalls<Routes>[]
  mappedRouter: MappedRouter<Routes>
  invoke: <CN extends AvailableCalls<Routes>, N extends RouteNamesWithMethod<Routes, CN>>(
    method: CN,
    name: N,
    args: RouteArgs<Routes, CN, N>
  ) => RouteReturn<Routes, CN, N>
  find: <CN extends AvailableCalls<Routes>, N extends RouteNamesWithMethod<Routes, CN>>(
    method: CN,
    name: N
  ) => { route: N; call: Find<Routes, CN, N> }
}
// publicly facing router type
export type Router<Routes extends RouterShape, RouterName extends string, CTX> = Omit<
  RouterAdapter<Routes, RouterName, CTX>,
  'invoke' | 'find' | 'mappedRouter'
>

/* -------------------------------------------------------------------------- */
/*                               api & adapters                               */
/* -------------------------------------------------------------------------- */
export type Adapters<Routes extends RouterShape, RN extends string, CTX extends Obj> = Record<
  string,
  (router: RouterAdapter<Routes, RN, CTX>) => any
>

export type AdapterMap<
  Routes extends RouterShape,
  RN extends string,
  CTX extends Obj,
  AD extends Adapters<Routes, RN, CTX>,
> = {
  [K in keyof AD]: AD[K] extends Fn<any, infer R> ? R : never
}

export type API<
  Routes extends RouterShape,
  N extends string,
  CTX extends Obj,
  AD extends Adapters<Routes, N, CTX>,
> = Router<Routes, N, CTX> & AdapterMap<Routes, N, CTX, AD>
