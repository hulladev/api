import type {
  APIProcedureArgs,
  APIProcedureIfInput,
  APIProcedureKey,
  APIProcedureKeyRoot,
  APIProcedureOverloads,
  APIProcedureResult,
  APIRouterPluginContext,
  APIPluginList,
  APISettings,
  DefaultAPISettings,
  Middleware,
  PluginId,
  Schema,
} from './types.public'

export type KeyofToString<K> = K extends string ? K : never

type HasMiddleware<M extends Middleware> = keyof M extends never ? false : true

type HasPlugins<P extends APIPluginList> = PluginId<P> extends never ? false : true

type NormalizeSelection<T> = T extends readonly unknown[] ? T : readonly []

type CastPluginList<T> = T extends APIPluginList ? T : readonly []

type UnionToIntersection<U> = (U extends any ? (value: U) => void : never) extends (value: infer I) => void ? I : never

declare const procedureTypeStateKey: unique symbol

type NormalizeAliasMap<T> =
  T extends Record<string, unknown>
    ? {
        [K in keyof T as K extends string ? K : never]: Extract<T[K], string>
      }
    : {}

type RemapKeys<T, A extends Record<string, string>> = {
  [K in keyof T as K extends string ? (K extends keyof A ? A[K] : K) : never]: T[K]
}

type TupleIncludes<T extends readonly unknown[], V> = T extends readonly [infer Head, ...infer Tail]
  ? [Head] extends [V]
    ? true
    : TupleIncludes<Tail, V>
  : false

type MergeTuple<T extends readonly unknown[], Acc extends readonly unknown[]> = T extends readonly [
  infer Head,
  ...infer Tail,
]
  ? MergeTuple<Tail, TupleIncludes<Acc, Head> extends true ? Acc : [...Acc, Head]>
  : Acc

export type MergeSelectionArgs<
  IA extends readonly unknown[] | undefined,
  LA extends readonly unknown[] | undefined,
> = IA extends readonly unknown[]
  ? LA extends readonly unknown[]
    ? MergeTuple<LA, IA>
    : IA
  : LA extends readonly unknown[]
    ? LA
    : undefined

export type UseBuilderArgs<M extends Middleware> = readonly KeyofToString<keyof M>[]

export type PluginBuilderArgs<P extends APIPluginList> = readonly PluginId<P>[]

export type MergeUseBuilderArgs<
  IA extends readonly unknown[] | undefined,
  LA extends readonly unknown[] | undefined,
> = MergeSelectionArgs<IA, LA>

export type MergePluginBuilderArgs<
  IA extends readonly unknown[] | undefined,
  LA extends readonly unknown[] | undefined,
> = MergeSelectionArgs<IA, LA>

export type EffectiveUseBuilderArgs<
  M extends Middleware,
  IA extends UseBuilderArgs<M> | undefined,
  LA extends UseBuilderArgs<M> | undefined,
> = MergeUseBuilderArgs<IA, LA> extends infer R ? (R extends UseBuilderArgs<M> ? R : undefined) : undefined

export type EffectiveRouterUseArgs<
  M extends Middleware,
  IA extends UseBuilderArgs<M> | undefined,
  LA extends UseBuilderArgs<M> | undefined,
> = MergeUseBuilderArgs<IA, LA> extends infer R ? (R extends UseBuilderArgs<M> ? R : undefined) : undefined

type PluginInjectModeFor<S, I extends string> = S extends { plugins?: infer PS }
  ? PS extends Record<string, unknown>
    ? I extends keyof PS
      ? PS[I] extends { inject?: infer Inject }
        ? Inject extends 'opt-in'
          ? 'opt-in'
          : 'always'
        : 'always'
      : 'always'
    : 'always'
  : 'always'

type AutoPluginBuilderArgs<P extends APIPluginList, S extends APISettings> = P extends readonly [
  infer Head,
  ...infer Tail,
]
  ? Head extends { id: infer Id extends string }
    ? PluginInjectModeFor<S, Id> extends 'opt-in'
      ? AutoPluginBuilderArgs<CastPluginList<Tail>, S>
      : readonly [Id, ...AutoPluginBuilderArgs<CastPluginList<Tail>, S>]
    : readonly []
  : readonly []

export type EffectiveRouterPluginArgs<
  P extends APIPluginList,
  S extends APISettings,
  PA extends PluginBuilderArgs<P> | undefined,
> =
  MergePluginBuilderArgs<AutoPluginBuilderArgs<P, S>, PA> extends infer R
    ? R extends PluginBuilderArgs<P>
      ? R
      : undefined
    : undefined

export type EffectiveProcedurePluginArgs<
  P extends APIPluginList,
  S extends APISettings,
  IA extends PluginBuilderArgs<P> | undefined,
  LA extends PluginBuilderArgs<P> | undefined,
> =
  MergePluginBuilderArgs<EffectiveRouterPluginArgs<P, S, IA>, LA> extends infer R
    ? R extends PluginBuilderArgs<P>
      ? R
      : undefined
    : undefined

type FindPlugin<P extends APIPluginList, I extends string> = Extract<P[number], { id: I }>

type RouterAliasMapFor<S, I extends string> = S extends { plugins?: infer PS }
  ? PS extends Record<string, unknown>
    ? I extends keyof PS
      ? PS[I] extends { aliases?: infer A }
        ? A extends { router?: infer R }
          ? NormalizeAliasMap<R>
          : {}
        : {}
      : {}
    : {}
  : {}

type ProcedureAliasMapFor<S, I extends string> = S extends { plugins?: infer PS }
  ? PS extends Record<string, unknown>
    ? I extends keyof PS
      ? PS[I] extends { aliases?: infer A }
        ? A extends { procedure?: infer R }
          ? NormalizeAliasMap<R>
          : {}
        : {}
      : {}
    : {}
  : {}

type RawContextMap<M extends Middleware, UA extends UseBuilderArgs<M> | undefined> = UA extends readonly (keyof M)[]
  ? {
      [K in UA[number]]: K extends keyof M ? ReturnType<M[K]> : never
    }
  : {}

type ContextMap<M extends Middleware, UA extends UseBuilderArgs<M> | undefined> = UA extends readonly (keyof M)[]
  ? {
      [K in UA[number]]: K extends keyof M ? Awaited<ReturnType<M[K]>> : never
    }
  : {}

type AnyValueIsPromise<T> =
  Extract<{ [K in keyof T]: T[K] extends Promise<any> ? true : false }[keyof T], true> extends never ? false : true

export type GetContext<M extends Middleware, UA extends UseBuilderArgs<M> | undefined> =
  AnyValueIsPromise<RawContextMap<M, UA>> extends true ? () => Promise<ContextMap<M, UA>> : () => ContextMap<M, UA>

type SchemaInput<S extends Schema | undefined> = S extends Schema<infer I, any> ? I : never

type SchemaOutput<S extends Schema | undefined> = S extends Schema<any, infer O> ? O : unknown

type HandlerSetupData<
  M extends Middleware,
  IA extends UseBuilderArgs<M> | undefined,
  LA extends UseBuilderArgs<M> | undefined,
  SI extends Schema | undefined,
> = (EffectiveUseBuilderArgs<M, IA, LA> extends undefined
  ? {}
  : { getContext: GetContext<M, EffectiveUseBuilderArgs<M, IA, LA>> }) &
  (SI extends Schema ? { input: SchemaOutput<SI> } : {})

type ApplyOutput<SO extends Schema | undefined, R, S extends APISettings> = SO extends Schema
  ? S['output'] extends 'raw'
    ? SchemaOutput<SO>
    : R extends Promise<any>
      ? Promise<SchemaOutput<SO>>
      : SchemaOutput<SO>
  : R

type RuntimeArgs<SI extends Schema | undefined> = SI extends Schema ? [input: SchemaInput<SI>] : []

type RuntimeReturn<SO extends Schema | undefined, R, S extends APISettings> = ApplyOutput<SO, R, S>

type RuntimeHandler<SI extends Schema | undefined, SO extends Schema | undefined, R, S extends APISettings> = (
  ...args: RuntimeArgs<SI>
) => RuntimeReturn<SO, R, S>

type ProcedureKeyRoot<RN extends string | undefined, N extends string | undefined> = N extends string
  ? RN extends string
    ? `${RN}/${N}`
    : N
  : never

type ProcedureKeyNamespace<
  SI extends Schema | undefined,
  RN extends string | undefined,
  N extends string | undefined,
> = {
  /**
   * Stable root key for this named procedure.
   *
   * @example
   * ```ts
   * users.byId.key.root // "users/byId"
   * ```
   */
  root: ProcedureKeyRoot<RN, N>
  /**
   * Full key with the procedure input appended.
   *
   * @example
   * ```ts
   * users.byId.key.full('user_123') // ["users/byId", "user_123"]
   * ```
   */
  full: (...args: RuntimeArgs<SI>) => readonly [ProcedureKeyRoot<RN, N>, ...RuntimeArgs<SI>]
}

export type ProcedureBuilderMeta<
  M extends Middleware,
  IA extends UseBuilderArgs<M> | undefined,
  LA extends UseBuilderArgs<M> | undefined,
  SI extends Schema | undefined,
  SO extends Schema | undefined,
  RN extends string | undefined,
> = {
  type: 'procedure'
  middleware: {
    router: IA extends UseBuilderArgs<M> ? IA : []
    procedure: LA extends UseBuilderArgs<M> ? LA : []
    selected: EffectiveUseBuilderArgs<M, IA, LA> extends UseBuilderArgs<M> ? EffectiveUseBuilderArgs<M, IA, LA> : []
  }
  input: SI
  output: SO
} & (RN extends string ? { router: RN } : {})

export type ProcedureHandlerMeta<
  M extends Middleware,
  IA extends UseBuilderArgs<M> | undefined,
  LA extends UseBuilderArgs<M> | undefined,
  SI extends Schema | undefined,
  SO extends Schema | undefined,
  RN extends string | undefined,
  N extends string | undefined = undefined,
> = ProcedureBuilderMeta<M, IA, LA, SI, SO, RN> & (N extends string ? { name: N } : {})

export type BaseProcedureHandler<
  M extends Middleware,
  IA extends UseBuilderArgs<M> | undefined,
  LA extends UseBuilderArgs<M> | undefined,
  SI extends Schema | undefined,
  SO extends Schema | undefined,
  RN extends string | undefined,
  R,
  S extends APISettings,
  N extends string | undefined = undefined,
> = {
  /**
   * Executes the finalized procedure.
   *
   * If an input schema was provided, the argument is parsed before the handler
   * runs. If an output schema was provided, the handler result is parsed before
   * being returned.
   *
   * @example
   * ```ts
   * const byId = api.procedure.input(z.string()).handler(({ input }) => input)
   *
   * byId.call('user_123')
   * ```
   */
  call: RuntimeHandler<SI, SO, R, S>
  /**
   * Runtime metadata describing selected middleware, schemas, and router/name
   * information when available.
   */
  $meta: ProcedureHandlerMeta<M, IA, LA, SI, SO, RN, N>
} & (N extends string ? { key: ProcedureKeyNamespace<SI, RN, N> } : {})

type ApplyRouterPluginHook<Plugin, Ctx> = Plugin extends { router?: infer H }
  ? Exclude<H, undefined> extends (ctx: Ctx) => infer O
    ? O
    : {}
  : {}

type ResolveProcedurePluginArgs<
  A,
  Handler extends (...args: any[]) => any,
  RN extends string | undefined,
  N extends string | undefined,
> = [A] extends [APIProcedureArgs]
  ? Parameters<Handler>
  : A extends readonly unknown[]
    ? { [K in keyof A]: ResolveProcedurePluginType<A[K], Handler, RN, N> }
    : never

type ResolveProcedurePluginType<
  T,
  Handler extends (...args: any[]) => any,
  RN extends string | undefined,
  N extends string | undefined,
> = [T] extends [APIProcedureArgs]
  ? Parameters<Handler>
  : [T] extends [APIProcedureIfInput<infer WhenInput, infer WhenNoInput>]
    ? Parameters<Handler> extends []
      ? ResolveProcedurePluginType<WhenNoInput, Handler, RN, N>
      : ResolveProcedurePluginType<WhenInput, Handler, RN, N>
    : [T] extends [APIProcedureOverloads<readonly [infer First, infer Second]>]
      ? ResolveProcedurePluginType<First, Handler, RN, N> extends (...args: infer A) => infer R
        ? ResolveProcedurePluginType<Second, Handler, RN, N> extends (...args: infer B) => infer S
          ? {
              (...args: B): S
              (...args: A): R
            }
          : never
        : never
      : [T] extends [APIProcedureKey]
        ? readonly [ProcedureKeyRoot<RN, N>, ...Parameters<Handler>]
        : [T] extends [APIProcedureKeyRoot]
          ? ProcedureKeyRoot<RN, N>
          : [T] extends [APIProcedureResult]
            ? ReturnType<Handler>
            : T extends (...args: infer A) => infer R
              ? (
                  ...args: ResolveProcedurePluginArgs<A, Handler, RN, N>
                ) => ResolveProcedurePluginType<R, Handler, RN, N>
              : T extends readonly unknown[]
                ? { [K in keyof T]: ResolveProcedurePluginType<T[K], Handler, RN, N> }
                : T extends object
                  ? { [K in keyof T]: ResolveProcedurePluginType<T[K], Handler, RN, N> }
                  : T

type ApplyProcedurePluginTypeHook<
  Plugin,
  Handler extends (...args: any[]) => any,
  RN extends string | undefined,
  N extends string | undefined,
> = Plugin extends { procedureTypes?: infer H } ? ResolveProcedurePluginType<Exclude<H, undefined>, Handler, RN, N> : {}

type RouterPluginExtensionsFromIds<
  M extends Middleware,
  P extends APIPluginList,
  Ids extends PluginBuilderArgs<P> | undefined,
  UA extends UseBuilderArgs<M> | undefined,
  N extends string,
  S extends APISettings,
  RA extends UseBuilderArgs<M> | undefined = undefined,
> = [NormalizeSelection<Ids>[number]] extends [never]
  ? {}
  : UnionToIntersection<
      {
        [K in NormalizeSelection<Ids>[number] & string]: RemapKeys<
          ApplyRouterPluginHook<FindPlugin<P, K>, APIRouterPluginContext<M, UA, N, S, P, RA>>,
          RouterAliasMapFor<S, K>
        >
      }[NormalizeSelection<Ids>[number] & string]
    >

type ProcedurePluginExtensionsFromIds<
  P extends APIPluginList,
  Ids extends PluginBuilderArgs<P> | undefined,
  SI extends Schema | undefined,
  SO extends Schema | undefined,
  RN extends string | undefined,
  S extends APISettings,
  N extends string | undefined,
  R,
> = N extends string
  ? [NormalizeSelection<Ids>[number]] extends [never]
    ? {}
    : UnionToIntersection<
        {
          [K in NormalizeSelection<Ids>[number] & string]: RemapKeys<
            ApplyProcedurePluginTypeHook<FindPlugin<P, K>, RuntimeHandler<SI, SO, R, S>, RN, N>,
            ProcedureAliasMapFor<S, K>
          >
        }[NormalizeSelection<Ids>[number] & string]
      >
  : {}

export type ProcedureHandler<
  M extends Middleware,
  IA extends UseBuilderArgs<M> | undefined,
  LA extends UseBuilderArgs<M> | undefined,
  SI extends Schema | undefined,
  SO extends Schema | undefined,
  RN extends string | undefined,
  R,
  S extends APISettings,
  N extends string | undefined = undefined,
  P extends APIPluginList = [],
  PA extends PluginBuilderArgs<P> | undefined = undefined,
> = BaseProcedureHandler<M, IA, LA, SI, SO, RN, R, S, N> &
  ProcedurePluginExtensionsFromIds<P, PA, SI, SO, RN, S, N, R> & {
    readonly [procedureTypeStateKey]?: {
      plugins: P
      active: PA
    }
  }

export type AnyProcedureHandler = {
  call: (...args: any[]) => unknown
  key?: {
    root: string
    full: (...args: any[]) => readonly [string, ...any[]]
  }
  $meta: Record<string, unknown> & {
    type: string
    input: Schema | undefined
    output: Schema | undefined
  }
}

type OverrideRouteMeta<H extends AnyProcedureHandler, N extends string, RN extends string> =
  H extends ProcedureHandler<
    infer M,
    infer IA,
    infer LA,
    infer SI,
    infer SO,
    any,
    infer R,
    infer S,
    any,
    infer P,
    infer PA
  >
    ? ProcedureHandler<M, IA, LA, SI, SO, RN, R, S, N, P, PA>
    : Omit<H, '$meta' | 'key'> & {
        $meta: H['$meta'] & {
          name: N
          router: RN
        }
        key: {
          root: ProcedureKeyRoot<RN, N>
          full: (...args: Parameters<H['call']>) => readonly [ProcedureKeyRoot<RN, N>, ...Parameters<H['call']>]
        }
      }

export type RouterDefinition<R extends Record<string, AnyProcedureHandler>, N extends string> = {
  [K in keyof R]: K extends string ? OverrideRouteMeta<R[K], K, N> : never
}

export type HandlerBuilder<
  M extends Middleware,
  IA extends UseBuilderArgs<M> | undefined,
  LA extends UseBuilderArgs<M> | undefined,
  SI extends Schema | undefined,
  SO extends Schema | undefined,
  RN extends string | undefined,
  S extends APISettings,
  P extends APIPluginList = [],
  IPA extends PluginBuilderArgs<P> | undefined = undefined,
  LPA extends PluginBuilderArgs<P> | undefined = undefined,
> = SO extends Schema
  ? S['output'] extends 'raw'
    ? <F extends (data: HandlerSetupData<M, IA, LA, SI>) => SchemaInput<SO>>(
        fn: F
      ) => ProcedureHandler<
        M,
        IA,
        LA,
        SI,
        SO,
        RN,
        ReturnType<F>,
        S,
        undefined,
        P,
        EffectiveProcedurePluginArgs<P, S, IPA, LPA>
      >
    : <F extends (data: HandlerSetupData<M, IA, LA, SI>) => SchemaInput<SO> | Promise<SchemaInput<SO>>>(
        fn: F
      ) => ProcedureHandler<
        M,
        IA,
        LA,
        SI,
        SO,
        RN,
        ReturnType<F>,
        S,
        undefined,
        P,
        EffectiveProcedurePluginArgs<P, S, IPA, LPA>
      >
  : <F extends (data: HandlerSetupData<M, IA, LA, SI>) => unknown>(
      fn: F
    ) => ProcedureHandler<
      M,
      IA,
      LA,
      SI,
      SO,
      RN,
      ReturnType<F>,
      S,
      undefined,
      P,
      EffectiveProcedurePluginArgs<P, S, IPA, LPA>
    >

export type UseBuilder<
  M extends Middleware,
  IA extends UseBuilderArgs<M> | undefined,
  SI extends Schema | undefined,
  SO extends Schema | undefined,
  RN extends string | undefined,
  S extends APISettings,
  P extends APIPluginList = [],
  IPA extends PluginBuilderArgs<P> | undefined = undefined,
  LPA extends PluginBuilderArgs<P> | undefined = undefined,
> = <UA extends UseBuilderArgs<M>>(...selected: UA) => ProcedureBuilder<M, IA, UA, SI, SO, RN, S, P, IPA, LPA>

export type ProcedurePluginBuilder<
  M extends Middleware,
  IA extends UseBuilderArgs<M> | undefined,
  LA extends UseBuilderArgs<M> | undefined,
  SI extends Schema | undefined,
  SO extends Schema | undefined,
  RN extends string | undefined,
  S extends APISettings,
  P extends APIPluginList = [],
  IPA extends PluginBuilderArgs<P> | undefined = undefined,
> = <PA extends PluginBuilderArgs<P>>(...selected: PA) => ProcedureBuilder<M, IA, LA, SI, SO, RN, S, P, IPA, PA>

export type InputBulder<
  M extends Middleware,
  IA extends UseBuilderArgs<M> | undefined,
  LA extends UseBuilderArgs<M> | undefined,
  SO extends Schema | undefined,
  RN extends string | undefined,
  S extends APISettings,
  P extends APIPluginList = [],
  IPA extends PluginBuilderArgs<P> | undefined = undefined,
  LPA extends PluginBuilderArgs<P> | undefined = undefined,
> = <SI extends Schema>(input: SI) => ProcedureBuilder<M, IA, LA, SI, SO, RN, S, P, IPA, LPA>

export type OutputBulder<
  M extends Middleware,
  IA extends UseBuilderArgs<M> | undefined,
  LA extends UseBuilderArgs<M> | undefined,
  SI extends Schema | undefined,
  RN extends string | undefined,
  S extends APISettings,
  P extends APIPluginList = [],
  IPA extends PluginBuilderArgs<P> | undefined = undefined,
  LPA extends PluginBuilderArgs<P> | undefined = undefined,
> = <SO extends Schema>(output: SO) => ProcedureBuilder<M, IA, LA, SI, SO, RN, S, P, IPA, LPA>

export type ProcedureBuilder<
  M extends Middleware,
  IA extends UseBuilderArgs<M> | undefined,
  LA extends UseBuilderArgs<M> | undefined,
  SI extends Schema | undefined,
  SO extends Schema | undefined,
  RN extends string | undefined = undefined,
  S extends APISettings = DefaultAPISettings,
  P extends APIPluginList = [],
  IPA extends PluginBuilderArgs<P> | undefined = undefined,
  LPA extends PluginBuilderArgs<P> | undefined = undefined,
> = (LA extends undefined
  ? HasMiddleware<M> extends true
    ? {
        /**
         * Selects middleware for this procedure.
         *
         * The selected context is available inside the handler through
         * `getContext()`.
         *
         * @example
         * ```ts
         * const me = api.procedure.use('session').handler(({ getContext }) => getContext())
         * ```
         */
        use: UseBuilder<M, IA, SI, SO, RN, S, P, IPA, LPA>
      }
    : {}
  : {}) &
  (LPA extends undefined
    ? HasPlugins<P> extends true
      ? {
          /**
           * Selects opt-in plugins for this procedure.
           *
           * Plugins configured with `inject: 'opt-in'` are only attached after
           * selecting them with `.plugin(...)`.
           */
          plugin: ProcedurePluginBuilder<M, IA, LA, SI, SO, RN, S, P, IPA>
        }
      : {}
    : {}) &
  (SI extends undefined
    ? {
        /**
         * Adds an input schema. The runtime argument is parsed before the
         * handler receives it as `input`.
         *
         * @example
         * ```ts
         * const byId = api.procedure.input(z.string()).handler(({ input }) => input)
         * ```
         */
        input: InputBulder<M, IA, LA, SO, RN, S, P, IPA, LPA>
      }
    : {}) &
  (SO extends undefined
    ? {
        /**
         * Adds an output schema. By default, promises are awaited before output
         * parsing.
         *
         * @example
         * ```ts
         * const name = api.procedure.output(z.string()).handler(async () => 'Samuel')
         * ```
         */
        output: OutputBulder<M, IA, LA, SI, RN, S, P, IPA, LPA>
      }
    : {}) & {
    /**
     * Finalizes the procedure with the function that performs the work.
     *
     * The returned handler exposes `.call(...)` and, when defined inside a
     * router, stable `.key` helpers.
     *
     * @example
     * ```ts
     * const byId = api.procedure
     *   .input(z.string())
     *   .handler(({ input }) => {
     *     return users.find((user) => user.id === input)
     *   })
     * ```
     */
    handler: HandlerBuilder<M, IA, LA, SI, SO, RN, S, P, IPA, LPA>
    /**
     * Builder metadata for middleware and schemas selected so far.
     */
    $meta: ProcedureBuilderMeta<M, IA, LA, SI, SO, RN>
  }

export type ProcedureState<
  M extends Middleware,
  IA extends UseBuilderArgs<M> | undefined,
  LA extends UseBuilderArgs<M> | undefined,
  SI extends Schema | undefined,
  SO extends Schema | undefined,
  RN extends string | undefined,
  P extends APIPluginList = [],
  IPA extends PluginBuilderArgs<P> | undefined = undefined,
  LPA extends PluginBuilderArgs<P> | undefined = undefined,
> = {
  inheritedUse: IA
  use: LA
  input: SI
  output: SO
  router: RN
  inheritedPlugins: IPA
  plugins: LPA
}

export type ResolvedContext<M extends Middleware, UA extends UseBuilderArgs<M>> = {
  [K in UA[number]]: Awaited<ReturnType<M[K]>>
}

export type RouterBuilderMeta<M extends Middleware, UA extends UseBuilderArgs<M> | undefined, N extends string> = {
  type: 'router'
  name: N
  middleware: UA extends UseBuilderArgs<M> ? UA : []
}

export type RouterState<
  M extends Middleware,
  UA extends UseBuilderArgs<M> | undefined,
  N extends string,
  P extends APIPluginList = [],
  PA extends PluginBuilderArgs<P> | undefined = undefined,
  RA extends UseBuilderArgs<M> | undefined = undefined,
> = {
  name: N
  rootUse: RA
  use: UA
  plugins: PA
}

export type RouterUseBuilder<
  M extends Middleware,
  RA extends UseBuilderArgs<M> | undefined,
  N extends string,
  S extends APISettings,
  P extends APIPluginList = [],
  PA extends PluginBuilderArgs<P> | undefined = undefined,
> = <UA extends UseBuilderArgs<M>>(...selected: UA) => RouterBuilder<M, UA, N, S, P, PA, RA>

export type RouterPluginSelectorBuilder<
  M extends Middleware,
  UA extends UseBuilderArgs<M> | undefined,
  N extends string,
  S extends APISettings,
  P extends APIPluginList = [],
  RA extends UseBuilderArgs<M> | undefined = undefined,
> = <PA extends PluginBuilderArgs<P>>(...selected: PA) => RouterBuilder<M, UA, N, S, P, PA, RA>

export type RouterDefineBuilder<
  M extends Middleware,
  UA extends UseBuilderArgs<M> | undefined,
  N extends string,
  S extends APISettings,
  P extends APIPluginList = [],
  PA extends PluginBuilderArgs<P> | undefined = undefined,
  RA extends UseBuilderArgs<M> | undefined = undefined,
> = <R extends Record<string, AnyProcedureHandler>>(
  define: (
    builders: {
      /**
       * Procedure builder scoped to this router.
       *
       * Router middleware and selected router plugins are inherited by
       * procedures created from this builder.
       */
      procedure: ProcedureBuilder<
        M,
        EffectiveRouterUseArgs<M, RA, UA>,
        undefined,
        undefined,
        undefined,
        N,
        S,
        P,
        EffectiveRouterPluginArgs<P, S, PA>,
        undefined
      >
    } & RouterPluginExtensionsFromIds<M, P, EffectiveRouterPluginArgs<P, S, PA>, UA, N, S, RA>
  ) => R
) => RouterDefinition<R, N>

export type RouterBuilder<
  M extends Middleware,
  UA extends UseBuilderArgs<M> | undefined,
  N extends string,
  S extends APISettings = DefaultAPISettings,
  P extends APIPluginList = [],
  PA extends PluginBuilderArgs<P> | undefined = undefined,
  RA extends UseBuilderArgs<M> | undefined = undefined,
> = (UA extends undefined
  ? HasMiddleware<M> extends true
    ? {
        /**
         * Selects middleware for every procedure defined in this router.
         *
         * @example
         * ```ts
         * const account = api.router('account').use('session').define(...)
         * ```
         */
        use: RouterUseBuilder<M, RA, N, S, P, PA>
      }
    : {}
  : {}) &
  (PA extends undefined
    ? HasPlugins<P> extends true
      ? {
          /**
           * Selects opt-in plugins for this router and its procedures.
           */
          plugin: RouterPluginSelectorBuilder<M, UA, N, S, P, RA>
        }
      : {}
    : {}) & {
    /**
     * Defines the named procedures that belong to this router.
     *
     * @example
     * ```ts
     * const users = api.router('users').define(({ procedure }) => ({
     *   all: procedure.handler(() => usersList),
     * }))
     * ```
     */
    define: RouterDefineBuilder<M, UA, N, S, P, PA, RA>
    /**
     * Runtime metadata for this router builder.
     */
    $meta: RouterBuilderMeta<M, UA, N>
  }
