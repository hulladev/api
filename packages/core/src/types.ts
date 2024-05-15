/* -------------------------------------------------------------------------- */
/*                         calls, procedures, requests                        */

import type { create } from './create'
import type { procedure } from './procedure'
import type { router } from './router'

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

export type ContextWithResult<
  R,
  N extends string,
  CN extends string,
  A extends Args,
  RR extends string = string,
> = Context<N, CN, A, RR> & { result: R }

export type ResolverArgs<CTX, R> = [R, CTX]
export type Resolver<CTX, R, R2 = R> = Fn<ResolverArgs<CTX, R>, R2>

export type Call<N extends string, CN extends string, CTX, A extends Args, R, R2 = R> = {
  route: N
  fn: Fn<A, R>
  resolver?: Resolver<CTX, R, R2>
  method: CN
}
export type CallConstructor<CTX = Obj> = (...args: any[]) => Call<string, string, CTX, any, any, any>

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
export type Route = Call<string, string, any, any, any>
export type RouterShape = readonly Route[]
export type RouterConfig<RN extends string, Routes extends RouterShape, CTX extends Obj> = {
  name: RN
  routes: Routes extends RouterMap<Routes> ? Routes : never
  interceptors?: {
    // we cannot use generics here, because then it enforces strict inferrence and raises type errors
    // that type could be potentially unrelated to generic. Useful for type-safety but not very practical
    // for everday users, hence we make it more lenient and just accept a match of any of the possible
    // instead of requiring type narrowing for every single individual route
    args?: (
      context: CTX &
        Context<
          AvailableCalls<Routes>,
          RouteNamesWithMethod<Routes, AvailableCalls<Routes>>,
          RouteArgs<Routes, AvailableCalls<Routes>, RouteNamesWithMethod<Routes, AvailableCalls<Routes>>>
        >
    ) => RouteArgs<Routes, AvailableCalls<Routes>, RouteNamesWithMethod<Routes, AvailableCalls<Routes>>>
    fn?: (
      contextWithResult: CTX &
        ContextWithResult<
          FnReturn<Routes, AvailableCalls<Routes>, RouteNamesWithMethod<Routes, AvailableCalls<Routes>>>,
          AvailableCalls<Routes>,
          RouteNamesWithMethod<Routes, AvailableCalls<Routes>>,
          RouteArgs<Routes, AvailableCalls<Routes>, RouteNamesWithMethod<Routes, AvailableCalls<Routes>>>
        >
    ) => FnReturn<Routes, AvailableCalls<Routes>, RouteNamesWithMethod<Routes, AvailableCalls<Routes>>>
    resolver?: (
      contextWithResult: CTX &
        ContextWithResult<
          RouteReturn<Routes, AvailableCalls<Routes>, RouteNamesWithMethod<Routes, AvailableCalls<Routes>>>,
          AvailableCalls<Routes>,
          RouteNamesWithMethod<Routes, AvailableCalls<Routes>>,
          RouteArgs<Routes, AvailableCalls<Routes>, RouteNamesWithMethod<Routes, AvailableCalls<Routes>>>
        >
    ) => RouteReturn<Routes, AvailableCalls<Routes>, RouteNamesWithMethod<Routes, AvailableCalls<Routes>>>
  }
}
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
export type FnReturn<
  Routes extends RouterShape,
  M extends AvailableCalls<Routes>,
  N extends RouteNamesWithMethod<Routes, M>,
> = Find<Routes, M, N> extends Call<string, string, any, any, infer R, any> ? R : never
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

export type AdapterProperties = {
  [K in keyof RouterAdapter<[], string, any>]: K extends keyof Router<[], string, any> ? never : K
}[keyof RouterAdapter<[], string, any>]

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

export type CustomMethodsX = Record<string, (...args: any[]) => Call<string, string, any, any[], any, any>> & {
  [K in 'procedure' | 'router' | 'create']?: TypeError<
    `ERROR: Property ${K} is reserved method. Please choose a different name`,
    `https://hulla.dev/docs/api/custom`
  >
}

export type CustomMethods = Record<string, any>

export type APIConfig<CTX extends Obj, CM extends CustomMethods> = {
  context?: CTX
  methods?: (ctx: CTX) => CM
}

export type MappedCM<CM extends CustomMethods> = {
  [K in keyof CM]: CM[K]
}

export type TypeError<Msg extends string, Doc extends string> = {
  reason: Msg
  info: Doc
}

export type CustomContext = Record<string, unknown> & {
  [K in keyof Context<string, string, any[], string>]?: TypeError<
    `ERROR: Property ${K} is reserved keyword for base context`,
    'https://hulla.dev/docs/api/context'
  >
}

export type APISDK<CTX extends CustomContext, CM extends CustomMethods> = MappedCM<CM> & {
  procedure: ReturnType<typeof procedure<CTX>>
  router: ReturnType<typeof router<CTX>>
  create: typeof create
}

// export type FnWithContext<CTX extends Obj, R> = <C extends CTX>(context: C) => R

// export type MethodMap<CTX extends Obj, CM extends CustomMethods<CTX>> = {
//   [M in keyof CM]: CM[M] extends FnWithContext<CTX, infer R>
//     ? R extends Record<string, infer RT>
//       ? RT extends CallConstructor<CTX>
//         ? R
//         : never
//       : R extends CallConstructor<CTX>
//         ? R extends (...args: infer AX) => Call<infer N, infer M, CTX, infer A, infer R, infer R2>
//           ? (...args: AX) => Call<N, M, CTX, A, R, R2>
//           : never
//         : never
//     : never
// }
