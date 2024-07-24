import type { procedure } from './procedure'
import type { router } from './router'

/* ------------------------------ common types ------------------------------ */
export type Obj = Record<string, unknown>
export type Args = readonly any[]
export type Fn<A extends Args, R> = (...args: A) => R
export type Hybrid<T> = T | Promise<T>
export type SomePromise<T extends Args> = T extends readonly [infer A, ...infer Rest]
  ? A extends Promise<any>
    ? true
    : A extends (...args: any[]) => Promise<any>
      ? true
      : SomePromise<Rest>
  : false

/* -------------------------- Procedures and routes ------------------------- */
export type Route<N extends string, M extends string, A extends Args, R> = {
  name: N
  method: M
  fn: (...args: A) => R
}
export type RouteShape = Route<string, string, any, unknown>
export type Schema<A extends Args, R, PK extends string> = Record<PK, (...args: A) => R>
export type ProcedureMeta<N extends string, M extends string, G extends string> = {
  route: N
  method: M
  group: G
}
export type Meta<R extends Routes, N extends string, M extends Methods<R>, RN extends string, G extends string> = {
  router: N
  route: RN
  method: M
  group: G
}

export type Routes = readonly RouteShape[]
export type InputArgs<I, PK extends string> =
  I extends Schema<any, infer R, PK> ? [R] : I extends Fn<infer A, any> ? A : []
export type InputResult<I, PK extends string> =
  I extends Schema<any, infer R, PK> ? R : I extends Fn<any, infer R> ? R : never
export type OutputFn<O> = (out: O) => O

/* ------------------------- Router and Interceptors ------------------------ */

export type RouterConfig<
  N extends string,
  R extends Routes,
  CTX extends Obj,
  PK extends string,
  AD extends Adapters<CTX, PK, R, N>,
> = {
  name: N
  routes: R
  adapters?: AD
}
export type RouterMap<R extends Routes> = R extends readonly [infer R1, ...infer Rest]
  ? R1 extends Route<infer N extends string, infer M extends string, infer A, infer R>
    ? //we need to use {} over never, since never breaks intersection
      Record<M, Record<N, Route<N, M, A, R>>> & (Rest extends Routes ? RouterMap<Rest> : {})
    : Rest extends Routes
      ? RouterMap<Rest>
      : {}
  : {}
export type Methods<R extends Routes> = keyof RouterMap<R>
export type RouteNamesWithMethod<R extends Routes, M extends Methods<R>> = keyof RouterMap<R>[M]
// internal utility since we need to annoyingly narrow down each Rest arg in ExactRoute
type _ExactRest<R, M, RN> = R extends Routes
  ? M extends keyof RouterMap<R>
    ? RN extends keyof RouterMap<R>[M]
      ? ExactRoute<R, M, RN>
      : never
    : never
  : never
export type ExactRoute<
  R extends Routes,
  M extends Methods<R>,
  RN extends RouteNamesWithMethod<R, M>,
> = R extends readonly [infer R1, ...infer Rest]
  ? R1 extends Route<infer N1, infer M1, any, any>
    ? M1 extends M
      ? N1 extends RN
        ? R1
        : _ExactRest<Rest, M, RN>
      : _ExactRest<Rest, M, RN>
    : _ExactRest<Rest, M, RN>
  : never
export type RouteArgs<R extends Routes, M extends Methods<R>, RN extends RouteNamesWithMethod<R, M>> = Parameters<
  ExactRoute<R, M, RN>['fn']
>
export type RouteReturn<R extends Routes, M extends Methods<R>, RN extends RouteNamesWithMethod<R, M>> = ReturnType<
  ExactRoute<R, M, RN>['fn']
>
/* ----------------------------- Integrations 🧩 ---------------------------- */
export type RouterAdapter<
  R extends Routes,
  N extends string,
  CTX extends Obj,
  PK extends string,
  AD extends Adapters<CTX, PK, R, N>,
> = API<R, N, CTX, PK, AD> & {
  routerMap: RouterMap<R>
  getRoute: <M extends keyof RouterMap<R>, RN extends RouteNamesWithMethod<R, M>>(
    method: M,
    route: RN
  ) => ExactRoute<R, M, RN>
  invoke: <M extends keyof RouterMap<R>, RN extends RouteNamesWithMethod<R, M>>(
    method: M,
    route: RN,
    ...args: RouteArgs<R, M, RN>
  ) => RouteReturn<R, M, RN>
}
export type Extension<CTX extends Obj, PK extends string, Res = unknown> = (int: { context: CTX; parseKey: PK }) => Res
export type Extensions<CTX extends Obj, PK extends string> = Record<string, Extension<CTX, PK>>
export type Adapter<CTX extends Obj, PK extends string, R extends Routes, RTN extends string, Res> = (
  routerAdapter: RouterAdapter<R, RTN, CTX, PK, any>
) => Res
export type Adapters<CTX extends Obj, PK extends string, R extends Routes, RTN extends string> = Record<
  string,
  Adapter<CTX, PK, R, RTN, any>
>

/* ----------------------------------- sdk ---------------------------------- */
export type MiddlewareOptions<CTX extends Obj, PK extends string, G extends string, DM extends string, I> = {
  context: CTX
  meta: ProcedureMeta<string, DM, G>
  input: I extends Schema<any, infer R, PK> ? R : I extends Fn<any, infer R> ? R : unknown
}

export type Group<CTX extends Obj, PK extends string, DM extends string, GN extends string> =
  | {
      defaults?: {
        method?: string
        input?: Schema<any, any, PK> | Fn<any, any>
        output?: Schema<any, any, PK> | OutputFn<any>
      }
      context?:
        | Obj
        | ((options: MiddlewareOptions<CTX, PK, GN, DM, unknown>) => Obj)
        | ((options: MiddlewareOptions<CTX, PK, GN, DM, unknown>) => Promise<Obj>)
    }
  | {
      defaults: {
        method: string
        input?: Schema<any, any, PK> | Fn<any, any>
        output?: Schema<any, any, PK> | OutputFn<any>
      }
      context?:
        | Obj
        | ((options: MiddlewareOptions<CTX, PK, GN, DM, unknown>) => Obj)
        | ((options: MiddlewareOptions<CTX, PK, GN, DM, unknown>) => Promise<Obj>)
      allowedMethods: string[]
    }

export type IntegrationFn<CTX extends Obj, PK extends string, K extends string, DM extends string> = (options: {
  context: CTX
  defaultMethod: DM
  parseKey: PK
  integrationName: K
}) => any

export type SDKConfig<
  CTX extends Obj,
  PK extends string,
  DM extends string,
  G extends {
    [K in string]: Group<CTX, PK, DM, K>
  },
  DI extends Schema<any, any, PK> | Fn<any, any>,
  DO extends Schema<any, any, PK> | OutputFn<any>,
  AM extends string[],
> =
  | {
      context?: CTX
      defaults?: {
        method?: DM
        input?: DI
        output?: DO
      }
      parseKey?: PK
      groups?: G
    }
  | {
      context: CTX
      defaults: {
        method: DM
        input?: DI
        output?: DO
      }
      parseKey?: PK
      groups?: G
      allowedMethods: AM
    }

export type SDK<
  CTX extends Obj,
  PK extends string,
  DM extends AM,
  G extends Record<string, unknown>,
  DI extends Schema<any, any, PK> | Fn<any, any>,
  DO extends Schema<any, any, PK> | OutputFn<any>,
  AM extends string,
> = {
  router: ReturnType<typeof router<CTX, PK>>
  procedure: ReturnType<typeof procedure<CTX, CTX, PK, DM, 'procedure', DI, DO, AM>>
  groups: G
} & {
  [K in keyof G]: K extends string
    ? G[K] extends { integration: infer I }
      ? I extends Fn<any, infer R>
        ? R
        : never
      : ReturnType<
          typeof procedure<CTX, RContext<CTX, G[K]>, PK, RDM<DM, G[K]>, K, RInput<PK, G[K]>, ROutput<PK, G[K]>, string>
        >
    : never
}

export type RContext<CTX extends Obj, G> = G extends { context: infer C }
  ? C extends Obj
    ? C
    : C extends (...args: any) => any
      ? C
      : CTX
  : CTX

export type ResContext<CTX> = CTX extends Obj
  ? CTX
  : CTX extends (...args: any[]) => infer R
    ? R extends Promise<infer U>
      ? U
      : R
    : never

export type RInput<PK extends string, G> = G extends { defaults: { input: infer I } }
  ? I extends Schema<any, any, PK>
    ? I
    : I extends Fn<any, any>
      ? I
      : undefined
  : undefined

export type ROutput<PK extends string, G> = G extends { defaults: { output: infer O } }
  ? O extends Schema<any, any, PK>
    ? O
    : O extends OutputFn<any>
      ? O
      : undefined
  : undefined

export type ResOutput<PK extends string, O> =
  O extends OutputFn<infer R> ? R : O extends Schema<any, infer R, PK> ? R : O

export type RDM<DM extends string, G> = G extends { defaults: { method: infer M } } ? (M extends string ? M : DM) : DM

/* ------------------------------ api export ✨ ------------------------------ */
export type InvokerMap<R extends Routes> = {
  [M in Methods<R>]: <N extends RouteNamesWithMethod<R, M>, A extends RouteArgs<R, M, N>>(
    name: N,
    ...args: A
  ) => RouteReturn<R, M, N>
}

export type API<
  R extends Routes,
  N extends string,
  CTX extends Obj,
  PK extends string,
  AD extends Adapters<CTX, PK, R, N>,
> = {
  name: N
  context: CTX
} & InvokerMap<R> & {
    [K in keyof AD]: ReturnType<AD[K]>
  }

// utility since keyof standard is string | number | symbl so we don't have to do extends string on everything
export type Keyof<T> = T extends Record<infer K, unknown> ? (K extends string ? K : never) : never
