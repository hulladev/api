import type {
  APIProcedureArgs,
  APIProcedureIfInput,
  APIProcedureKey,
  APIProcedureKeyRoot,
  APIProcedureOverloads,
  APIProcedureMappedResultItem,
  APIProcedureResult,
  APIProcedureResultItem,
  APIProcedureResultItemMapper,
  APIProcedureTypeOpaque,
  APIPluginList,
  APISettings,
  DefaultAPISettings,
  HTTPMethod,
  HTTPRoute,
  Middleware,
  NamedProcedureInputTupleSchema,
  PluginId,
  ProcedureInputArgs,
  ProcedureInputTupleSchema,
  RouterPreset,
  Schema,
} from './types.public'

type KeyofToString<K> = K extends string ? K : never

type HasMiddleware<M extends Middleware> = keyof M extends never ? false : true

type HasPlugins<P extends APIPluginList> = PluginId<P> extends never ? false : true

type NormalizeSelection<T> = T extends readonly unknown[] ? T : readonly []

type CastPluginList<T> = T extends APIPluginList ? T : readonly []

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

type MergeSelectionArgs<
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

type MergeUseBuilderArgs<
  IA extends readonly unknown[] | undefined,
  LA extends readonly unknown[] | undefined,
> = MergeSelectionArgs<IA, LA>

type MergePluginBuilderArgs<
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

type PluginNamespace<Plugin> = Plugin extends { namespace?: infer N extends string }
  ? `$${N}`
  : Plugin extends { id: infer I extends string }
    ? `$${I}`
    : never

type UnionToIntersection<U> = (U extends unknown ? (value: U) => void : never) extends (value: infer I) => void
  ? I
  : never

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

type ValueCanBePromise<T> = Extract<T, PromiseLike<unknown>> extends never ? false : true

type AnyValueIsPromise<T> =
  Extract<{ [K in keyof T]: ValueCanBePromise<T[K]> }[keyof T], true> extends never ? false : true

type GetContext<M extends Middleware, UA extends UseBuilderArgs<M> | undefined> =
  AnyValueIsPromise<RawContextMap<M, UA>> extends true ? () => Promise<ContextMap<M, UA>> : () => ContextMap<M, UA>

type SchemaInput<S extends Schema | undefined> = S extends Schema<infer I, unknown> ? I : never

type SchemaOutput<S extends Schema | undefined> = S extends Schema<unknown, infer O> ? O : unknown

type RoutePathParameters<Path extends string> = Path extends `${string}/:${infer Parameter}/${infer Rest}`
  ? readonly [Parameter, ...RoutePathParameters<`/${Rest}`>]
  : Path extends `${string}/:${infer Parameter}`
    ? readonly [Parameter]
    : readonly []

type RouteParameters<HR extends HTTPRoute | undefined> =
  HR extends HTTPRoute<HTTPMethod, infer Path> ? RoutePathParameters<Path> : readonly []

type TupleCovers<Values extends readonly unknown[], Required extends readonly unknown[]> = Required extends readonly [
  unknown,
  ...infer RequiredRest,
]
  ? Values extends readonly [unknown, ...infer ValueRest]
    ? TupleCovers<ValueRest, RequiredRest>
    : false
  : true

type RouteInputSchemas<SI extends Schema | undefined> = SI extends {
  readonly 'hulla.api.namedInputSchemas': infer Schemas extends readonly Schema[]
}
  ? Schemas
  : SI extends { readonly 'hulla.api.inputSchemas': infer Schemas extends readonly Schema[] }
    ? Schemas
    : never

type HTTPPathScalar = string | number | boolean | bigint | Date | Uint8Array | null

type RouteObjectCovers<Input, Parameters extends readonly string[]> = unknown extends Input
  ? true
  : [Exclude<Input, undefined>] extends [HTTPPathScalar]
    ? Parameters extends readonly [string]
      ? true
      : false
    : [Exclude<Input, null | undefined>] extends [Record<Parameters[number], unknown>]
      ? true
      : false

type RouteInputIsValid<HR extends HTTPRoute | undefined, SI extends Schema | undefined> =
  RouteParameters<HR> extends infer Parameters extends readonly string[]
    ? Parameters extends readonly []
      ? true
      : SI extends Schema
        ? [RouteInputSchemas<SI>] extends [never]
          ? RouteObjectCovers<SchemaInput<SI>, Parameters>
          : TupleCovers<RouteInputSchemas<SI>, Parameters>
        : false
    : false

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
    : R extends PromiseLike<unknown>
      ? Promise<SchemaOutput<SO>>
      : SchemaOutput<SO>
  : R

type RuntimeArgs<SI extends Schema | undefined> = ProcedureInputArgs<SI>

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
   * users.byId.$key.root // "users/byId"
   * ```
   */
  root: ProcedureKeyRoot<RN, N>
  /**
   * Full key with the procedure input appended.
   *
   * @example
   * ```ts
   * users.byId.$key.full('user_123') // ["users/byId", "user_123"]
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
  HR extends HTTPRoute | undefined = undefined,
> = {
  type: 'procedure'
  middleware: {
    router: IA extends UseBuilderArgs<M> ? IA : []
    procedure: LA extends UseBuilderArgs<M> ? LA : []
    selected: EffectiveUseBuilderArgs<M, IA, LA> extends UseBuilderArgs<M> ? EffectiveUseBuilderArgs<M, IA, LA> : []
  }
  input: SI
  output: SO
} & (RN extends string ? { router: RN } : {}) &
  (HR extends HTTPRoute ? { route: HR } : { route?: undefined })

export type ProcedureHandlerMeta<
  M extends Middleware,
  IA extends UseBuilderArgs<M> | undefined,
  LA extends UseBuilderArgs<M> | undefined,
  SI extends Schema | undefined,
  SO extends Schema | undefined,
  RN extends string | undefined,
  N extends string | undefined = undefined,
  HR extends HTTPRoute | undefined = undefined,
> = ProcedureBuilderMeta<M, IA, LA, SI, SO, RN, HR> & (N extends string ? { name: N } : {})

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
  HR extends HTTPRoute | undefined = undefined,
> = RuntimeHandler<SI, SO, R, S> & {
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
   * byId('user_123')
   * ```
   */
  $meta: ProcedureHandlerMeta<M, IA, LA, SI, SO, RN, N, HR>
} & (N extends string ? { $key: ProcedureKeyNamespace<SI, RN, N> } : {})

type ApplyRouterPluginHook<Plugin> = Plugin extends { router?: infer H }
  ? Exclude<H, undefined> extends (...args: never[]) => infer O
    ? O
    : {}
  : {}

type ResolveProcedurePluginArgs<
  A,
  Handler extends (...args: never[]) => unknown,
  RN extends string | undefined,
  N extends string | undefined,
> = [A] extends [APIProcedureArgs]
  ? Parameters<Handler>
  : A extends readonly unknown[]
    ? { [K in keyof A]: ResolveProcedurePluginType<A[K], Handler, RN, N> }
    : never

type ResolveProcedurePluginType<
  T,
  Handler extends (...args: never[]) => unknown,
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
            : [T] extends [APIProcedureResultItem]
              ? Awaited<ReturnType<Handler>> extends readonly (infer Item extends object)[]
                ? Item
                : never
              : [T] extends [APIProcedureMappedResultItem<infer Mapper extends APIProcedureResultItemMapper>]
                ? Awaited<ReturnType<Handler>> extends readonly (infer Item extends object)[]
                  ? (Mapper & { readonly input: Item })['output']
                  : never
                : [T] extends [APIProcedureTypeOpaque<infer Opaque>]
                  ? Opaque
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
  Handler extends (...args: never[]) => unknown,
  RN extends string | undefined,
  N extends string | undefined,
> = Plugin extends { procedureTypes?: infer H } ? ResolveProcedurePluginType<Exclude<H, undefined>, Handler, RN, N> : {}

type RouterPluginExtensionForId<K, P extends APIPluginList, S extends APISettings> = K extends string
  ? {
      [Namespace in PluginNamespace<FindPlugin<P, K>>]: RemapKeys<
        ApplyRouterPluginHook<FindPlugin<P, K>>,
        RouterAliasMapFor<S, K>
      >
    }
  : never

type RouterPluginExtensionsFromIds<
  P extends APIPluginList,
  Ids extends PluginBuilderArgs<P> | undefined,
  S extends APISettings,
> = [NormalizeSelection<Ids>[number]] extends [never]
  ? {}
  : UnionToIntersection<RouterPluginExtensionForId<NormalizeSelection<Ids>[number], P, S>>

type ProcedurePluginExtensionForId<
  K,
  P extends APIPluginList,
  SI extends Schema | undefined,
  SO extends Schema | undefined,
  RN extends string | undefined,
  S extends APISettings,
  N extends string,
  R,
> = K extends string
  ? {
      [Namespace in PluginNamespace<FindPlugin<P, K>>]: RemapKeys<
        ApplyProcedurePluginTypeHook<FindPlugin<P, K>, RuntimeHandler<SI, SO, R, S>, RN, N>,
        ProcedureAliasMapFor<S, K>
      >
    }
  : never

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
    : UnionToIntersection<ProcedurePluginExtensionForId<NormalizeSelection<Ids>[number], P, SI, SO, RN, S, N, R>>
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
  HR extends HTTPRoute | undefined = undefined,
> = BaseProcedureHandler<M, IA, LA, SI, SO, RN, R, S, N, HR> &
  ProcedurePluginExtensionsFromIds<P, PA, SI, SO, RN, S, N, R> & {
    readonly [procedureTypeStateKey]?: {
      plugins: P
      active: PA
    }
  }

type AnyProcedureHandler = ((...args: never[]) => unknown) & {
  $key?: {
    root: string
    full: (...args: never[]) => readonly [string, ...unknown[]]
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
    infer _RN,
    infer R,
    infer S,
    infer _N,
    infer P,
    infer PA,
    infer HR
  >
    ? ProcedureHandler<M, IA, LA, SI, SO, RN, R, S, N, P, PA, HR> & Omit<H, '$meta' | '$key'>
    : H & {
        $meta: H['$meta'] & {
          name: N
          router: RN
        }
        $key: {
          root: ProcedureKeyRoot<RN, N>
          full: (...args: Parameters<H>) => readonly [ProcedureKeyRoot<RN, N>, ...Parameters<H>]
        }
      }

type RouterDefinition<R extends Record<string, AnyProcedureHandler>, N extends string> = {
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
  HR extends HTTPRoute | undefined = undefined,
> =
  RouteInputIsValid<HR, SI> extends true
    ? SO extends Schema
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
            EffectiveProcedurePluginArgs<P, S, IPA, LPA>,
            HR
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
            EffectiveProcedurePluginArgs<P, S, IPA, LPA>,
            HR
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
          EffectiveProcedurePluginArgs<P, S, IPA, LPA>,
          HR
        >
    : never

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
  HR extends HTTPRoute | undefined = undefined,
> = <UA extends UseBuilderArgs<M>>(...selected: UA) => ProcedureBuilder<M, IA, UA, SI, SO, RN, S, P, IPA, LPA, HR>

type ProcedurePluginBuilder<
  M extends Middleware,
  IA extends UseBuilderArgs<M> | undefined,
  LA extends UseBuilderArgs<M> | undefined,
  SI extends Schema | undefined,
  SO extends Schema | undefined,
  RN extends string | undefined,
  S extends APISettings,
  P extends APIPluginList = [],
  IPA extends PluginBuilderArgs<P> | undefined = undefined,
  HR extends HTTPRoute | undefined = undefined,
> = <PA extends PluginBuilderArgs<P>>(...selected: PA) => ProcedureBuilder<M, IA, LA, SI, SO, RN, S, P, IPA, PA, HR>

export type InputBuilder<
  M extends Middleware,
  IA extends UseBuilderArgs<M> | undefined,
  LA extends UseBuilderArgs<M> | undefined,
  SO extends Schema | undefined,
  RN extends string | undefined,
  S extends APISettings,
  P extends APIPluginList = [],
  IPA extends PluginBuilderArgs<P> | undefined = undefined,
  LPA extends PluginBuilderArgs<P> | undefined = undefined,
  HR extends HTTPRoute | undefined = undefined,
> = (<SI extends Schema, S2 extends Schema | undefined = undefined, const Rest extends readonly Schema[] = []>(
  input: SI,
  second?: S2,
  ...rest: Rest
) => ProcedureBuilder<
  M,
  IA,
  LA,
  S2 extends Schema ? ProcedureInputTupleSchema<readonly [SI, S2, ...Rest]> : SI,
  SO,
  RN,
  S,
  P,
  IPA,
  LPA,
  HR
>) & {
  $named: <const Schemas extends readonly [Schema, ...(Schema | undefined)[]]>(
    ...inputs: { [K in keyof Schemas]-?: Exclude<Schemas[K], undefined> }
  ) => ProcedureBuilder<M, IA, LA, NamedProcedureInputTupleSchema<Schemas>, SO, RN, S, P, IPA, LPA, HR>
}

export type OutputBuilder<
  M extends Middleware,
  IA extends UseBuilderArgs<M> | undefined,
  LA extends UseBuilderArgs<M> | undefined,
  SI extends Schema | undefined,
  RN extends string | undefined,
  S extends APISettings,
  P extends APIPluginList = [],
  IPA extends PluginBuilderArgs<P> | undefined = undefined,
  LPA extends PluginBuilderArgs<P> | undefined = undefined,
  HR extends HTTPRoute | undefined = undefined,
> = <SO extends Schema>(output: SO) => ProcedureBuilder<M, IA, LA, SI, SO, RN, S, P, IPA, LPA, HR>

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
  HR extends HTTPRoute | undefined = undefined,
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
        use: UseBuilder<M, IA, SI, SO, RN, S, P, IPA, LPA, HR>
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
          plugin: ProcedurePluginBuilder<M, IA, LA, SI, SO, RN, S, P, IPA, HR>
        }
      : {}
    : {}) &
  (SI extends undefined
    ? {
        /**
         * Adds an input schema. The runtime argument is parsed before the
         * handler receives it as `input`. Use `.input.$named<[...]>(...)` when
         * emitted declarations should preserve explicit positional labels.
         *
         * @example
         * ```ts
         * const byId = api.procedure.input(z.string()).handler(({ input }) => input)
         * ```
         */
        input: InputBuilder<M, IA, LA, SO, RN, S, P, IPA, LPA, HR>
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
        output: OutputBuilder<M, IA, LA, SI, RN, S, P, IPA, LPA, HR>
      }
    : {}) & {
    /**
     * Finalizes the procedure with the function that performs the work.
     *
     * The returned handler is callable and, when defined inside a router,
     * exposes stable `.$key` helpers.
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
    handler: HandlerBuilder<M, IA, LA, SI, SO, RN, S, P, IPA, LPA, HR>
    /**
     * Builder metadata for middleware and schemas selected so far.
     */
    $meta: ProcedureBuilderMeta<M, IA, LA, SI, SO, RN, HR>
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
  HR extends HTTPRoute | undefined = undefined,
> = {
  inheritedUse: IA
  use: LA
  input: SI
  output: SO
  router: RN
  route: HR
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

type RouterUseBuilder<
  M extends Middleware,
  RA extends UseBuilderArgs<M> | undefined,
  N extends string,
  S extends APISettings,
  P extends APIPluginList = [],
  PA extends PluginBuilderArgs<P> | undefined = undefined,
> = <UA extends UseBuilderArgs<M>>(...selected: UA) => RouterBuilder<M, UA, N, S, P, PA, RA>

type RouterPluginSelectorBuilder<
  M extends Middleware,
  UA extends UseBuilderArgs<M> | undefined,
  N extends string,
  S extends APISettings,
  P extends APIPluginList = [],
  RA extends UseBuilderArgs<M> | undefined = undefined,
> = <PA extends PluginBuilderArgs<P>>(...selected: PA) => RouterBuilder<M, UA, N, S, P, PA, RA>

type RouterDefinitionBuilders<
  M extends Middleware,
  UA extends UseBuilderArgs<M> | undefined,
  N extends string,
  S extends APISettings,
  P extends APIPluginList = [],
  PA extends PluginBuilderArgs<P> | undefined = undefined,
  RA extends UseBuilderArgs<M> | undefined = undefined,
> = {
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
  route: <const Method extends HTTPMethod, const Path extends string>(
    method: Method,
    path: Path
  ) => ProcedureBuilder<
    M,
    EffectiveRouterUseArgs<M, RA, UA>,
    undefined,
    undefined,
    undefined,
    N,
    S,
    P,
    EffectiveRouterPluginArgs<P, S, PA>,
    undefined,
    HTTPRoute<Method, Path>
  >
} & RouterPluginExtensionsFromIds<P, EffectiveRouterPluginArgs<P, S, PA>, S>

type RouterDefineBuilder<
  M extends Middleware,
  UA extends UseBuilderArgs<M> | undefined,
  N extends string,
  S extends APISettings,
  P extends APIPluginList = [],
  PA extends PluginBuilderArgs<P> | undefined = undefined,
  RA extends UseBuilderArgs<M> | undefined = undefined,
> = {
  <R extends Record<string, AnyProcedureHandler>>(
    define: (builders: RouterDefinitionBuilders<M, UA, N, S, P, PA, RA>) => R
  ): RouterDefinition<R, N>
  <G extends Record<string, AnyProcedureHandler>>(
    preset: RouterPreset<G, PluginId<P> | undefined>
  ): RouterDefinition<G, N>
  <G extends Record<string, AnyProcedureHandler>, R extends Record<string, AnyProcedureHandler>>(
    preset: RouterPreset<G, PluginId<P> | undefined>,
    customize: (builders: RouterDefinitionBuilders<M, UA, N, S, P, PA, RA> & { generated: G }) => R
  ): RouterDefinition<R, N>
}

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
