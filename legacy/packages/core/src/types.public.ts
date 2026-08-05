import type {
  BaseProcedureHandler,
  EffectiveRouterUseArgs,
  PluginBuilderArgs,
  ProcedureBuilder,
  ProcedureHandlerMeta,
  RouterBuilder,
  RouterBuilderMeta,
  UseBuilderArgs,
} from './types.private'

/**
 * Named context factories that can be selected with `.use(...)`.
 *
 * Each middleware function runs when the procedure is called. The resolved
 * values are available from `getContext()` under the same keys.
 *
 * @example
 * ```ts
 * type Session = { userId: string }
 * type AdminPermissions = { canDeleteUsers: boolean }
 *
 * async function getSession(): Promise<Session> {
 *   return fetch('/api/session').then((res) => res.json())
 * }
 *
 * async function getAdminPermissions(): Promise<AdminPermissions> {
 *   const permissions = await fetch('/api/admin-permissions').then((res) => res.json() as Promise<AdminPermissions>)
 *
 *   if (!permissions.canDeleteUsers) {
 *     throw new Error('Admin access required')
 *   }
 *
 *   return permissions
 * }
 *
 * const api = createApi({
 *   middleware: {
 *     session: getSession,
 *     admin: getAdminPermissions,
 *   },
 * })
 * ```
 */
export type ProcedureExecutionContext = {
  readonly request?: Request
  readonly signal?: AbortSignal
}

export type Middleware = Record<string, (context: ProcedureExecutionContext) => unknown | PromiseLike<unknown>>

/**
 * Minimal schema shape used by `.input(...)` and `.output(...)`.
 *
 * Zod schemas satisfy this shape, and custom validators can implement it too.
 */
export type Schema<Input = unknown, Output = Input> = {
  parse: (input: unknown) => Output
  parseAsync?: (input: unknown) => Promise<Output>
  _input: Input
  _output: Output
}

/** The value observed by an HTTP client after standard JSON serialization. */
export type HTTPSerialized<T> = T extends Date | bigint | Uint8Array
  ? string
  : T extends readonly unknown[]
    ? { [K in keyof T]: HTTPSerialized<T[K]> }
    : T extends object
      ? { [K in keyof T]: HTTPSerialized<T[K]> }
      : T

export type ProcedureInputTupleSchema<Schemas extends readonly Schema[] = readonly Schema[]> = Schema<
  { [K in keyof Schemas]: Schemas[K] extends Schema<infer Input, unknown> ? Input : never },
  { [K in keyof Schemas]: Schemas[K] extends Schema<unknown, infer Output> ? Output : never }
> & {
  readonly 'hulla.api.inputSchemas': Schemas
}

type NamedInputSchemas = readonly [Schema, ...(Schema | undefined)[]]

type NamedSchemaInputValue<S> = Exclude<S, undefined> extends Schema<infer Input, unknown> ? Input : never
type NamedSchemaOutputValue<S> = Exclude<S, undefined> extends Schema<unknown, infer Output> ? Output : never

export type NamedProcedureInputTupleSchema<Schemas extends NamedInputSchemas> = Schema<
  { [K in keyof Schemas]: NamedSchemaInputValue<Schemas[K]> },
  { [K in keyof Required<Schemas>]: NamedSchemaOutputValue<Required<Schemas>[K]> }
> & {
  readonly 'hulla.api.inputSchemas': readonly Schema[]
  readonly 'hulla.api.namedInputSchemas': Schemas
}

type SchemaInputValue<S extends Schema> = S extends Schema<infer Input, unknown> ? Input : never

type OptionalTrailingArgs<Values extends readonly unknown[]> = Values extends readonly [...infer Head, infer Tail]
  ? undefined extends Tail
    ? [...OptionalTrailingArgs<Head>, Tail?]
    : Values
  : []

/** The positional arguments accepted by a procedure input definition. */
export type ProcedureInputArgs<SI extends Schema | undefined> =
  SI extends NamedProcedureInputTupleSchema<infer Schemas>
    ? { [K in keyof Schemas]: NamedSchemaInputValue<Schemas[K]> }
    : SI extends ProcedureInputTupleSchema<infer Schemas>
      ? OptionalTrailingArgs<{ [K in keyof Schemas]: SchemaInputValue<Schemas[K]> }>
      : SI extends Schema<infer Input, unknown>
        ? [input: Input]
        : []

/**
 * Controls when output schemas parse handler results.
 *
 * `awaited` parses resolved promise values and is the default. `raw` validates
 * the exact unawaited return value.
 */
export type OutputSetting = 'awaited' | 'raw'

export type PluginId<P extends APIPluginList> = P[number] extends infer Plugin
  ? Plugin extends { id: infer Id extends string }
    ? Id
    : never
  : never

export type APIPluginInjection = 'always' | 'opt-in'

export type APIPluginAliasMap = Record<string, string>

export type APIPluginRuntimeSettings = {
  /**
   * Controls whether plugin members are added automatically or only after
   * selecting the plugin with `.plugin(...)`.
   */
  inject?: APIPluginInjection
  /**
   * Renames router or procedure members exposed by the plugin.
   */
  aliases?: {
    router?: APIPluginAliasMap
    procedure?: APIPluginAliasMap
  }
}

export type ResolvedAPIPluginRuntimeSettings = {
  inject: APIPluginInjection
  aliases: {
    router: APIPluginAliasMap
    procedure: APIPluginAliasMap
  }
}

export type APIPluginSettingsById<P extends APIPluginList> = Partial<Record<PluginId<P>, APIPluginRuntimeSettings>>

type APIRouterPluginHookConstraint = (...args: never[]) => Record<string, unknown>

type APIProcedurePluginHookConstraint = (...args: never[]) => Record<string, unknown>

export type APIProcedureArgs = readonly [
  {
    readonly 'hulla.api.procedureArgs': 'args'
  },
]

export type APIProcedureKey = readonly [string] & {
  readonly 'hulla.api.procedureKey': 'key'
}

export type APIProcedureKeyRoot = string & {
  readonly 'hulla.api.procedureKeyRoot': 'key-root'
}

export type APIProcedureResult = {
  readonly 'hulla.api.procedureResult': 'result'
}

/**
 * Type-hook token resolved to an item in the awaited array returned by a procedure.
 * Resolves to `never` when the procedure does not return an array.
 */
export type APIProcedureResultItem = {
  readonly 'hulla.api.procedureResultItem': 'result-item'
}

/** Type mapper used by plugin return types that need the procedure's array item. */
export type APIProcedureResultItemMapper = {
  readonly input: unknown
  readonly output: unknown
}

/** Resolves a plugin type mapper with the item returned by an array procedure. */
export type APIProcedureMappedResultItem<Mapper extends APIProcedureResultItemMapper> = {
  readonly 'hulla.api.procedureMappedResultItem': Mapper
}

/** Keeps a third-party type opaque while resolving a procedure plugin type hook. */
export type APIProcedureTypeOpaque<T> = {
  readonly 'hulla.api.procedureTypeOpaque': T
}

export type APIProcedureIfInput<WhenInput, WhenNoInput> = {
  readonly 'hulla.api.procedureIfInput': {
    input: WhenInput
    noInput: WhenNoInput
  }
}

export type APIProcedureOverloads<T extends readonly unknown[]> = {
  readonly 'hulla.api.procedureOverloads': T
}

export type AnyAPIProcedurePluginTypeHook = Record<string, unknown>

export type APIPluginGeneration = {
  readonly from: string
  readonly name: string
  readonly options?: unknown
}

export type APIPlugin<
  I extends string = string,
  RH extends APIRouterPluginHookConstraint | undefined = AnyAPIRouterPluginHook | undefined,
  PH extends APIProcedurePluginHookConstraint | undefined = AnyAPIProcedurePluginHook | undefined,
  PTH extends AnyAPIProcedurePluginTypeHook | undefined = AnyAPIProcedurePluginTypeHook | undefined,
  N extends string = I,
> = {
  id: I
  /** Namespace used for router and procedure extensions. It is exposed with a `$` prefix and defaults to `id`. */
  namespace?: N
  /** Server-only plugins participate in declarations but are never reconstructed in browser clients. */
  target?: 'universal' | 'server'
  router?: RH
  procedure?: PH
  procedureTypes?: PTH
  defaults?: APIPluginRuntimeSettings
  generation?: APIPluginGeneration
}

export type APIPluginList = readonly APIPlugin<
  string,
  APIRouterPluginHookConstraint | undefined,
  APIProcedurePluginHookConstraint | undefined,
  AnyAPIProcedurePluginTypeHook | undefined,
  string
>[]

export function definePlugin<const P extends APIPlugin>(plugin: P): P {
  return plugin
}

export type HTTPMethod =
  | 'CONNECT'
  | 'DELETE'
  | 'GET'
  | 'HEAD'
  | 'OPTIONS'
  | 'PATCH'
  | 'POST'
  | 'PUT'
  | 'QUERY'
  | 'TRACE'

export type HTTPRoute<Method extends HTTPMethod = HTTPMethod, Path extends string = string> = {
  readonly method: Method
  readonly path: Path
}

export type {
  HTTPContract,
  HTTPInputContract,
  HTTPRouteContract,
  HTTPWireInput,
  HTTPWireOutput,
  HTTPWireSchemaConverter,
  HTTPWireType,
} from './wire'

export type RouterPresetRoutes = Record<string, (...args: never[]) => unknown>

export type RouterPresetBuilderContext<RequiredPlugin extends string | undefined = undefined> = {
  readonly $api: {
    readonly plugins: {
      readonly registry: Record<Exclude<RequiredPlugin, undefined>, APIPlugin>
    }
  }
  readonly procedure: ProcedureBuilder<
    Middleware,
    undefined,
    undefined,
    undefined,
    undefined,
    string,
    APISettings,
    APIPluginList
  >
  route<const Method extends HTTPMethod, const Path extends string>(
    method: Method,
    path: Path
  ): ProcedureBuilder<Middleware, undefined, undefined, undefined, undefined, string, APISettings, APIPluginList>
}

export type RouterPreset<
  Generated extends RouterPresetRoutes = RouterPresetRoutes,
  RequiredPlugin extends string | undefined = undefined,
> = {
  readonly $hulla: { readonly kind: 'hulla.api.router-preset'; readonly generation?: unknown }
  readonly requiredPlugin: RequiredPlugin
  create(builders: RouterPresetBuilderContext<RequiredPlugin>): Generated
}

export function defineRouterPreset<
  const Generated extends RouterPresetRoutes,
  const RequiredPlugin extends string | undefined = undefined,
>(
  create: (builders: RouterPresetBuilderContext<RequiredPlugin>) => Generated,
  options?: { readonly requires?: RequiredPlugin; readonly generation?: unknown }
): RouterPreset<Generated, RequiredPlugin> {
  return {
    $hulla: {
      kind: 'hulla.api.router-preset',
      ...(options?.generation === undefined ? {} : { generation: options.generation }),
    },
    requiredPlugin: options?.requires as RequiredPlugin,
    create,
  }
}

export type APIPluginRegistry<P extends APIPluginList> = {
  [K in PluginId<P>]: Extract<P[number], { id: K }>
}

export type ResolvedAPIPluginSettingsById<P extends APIPluginList> = {
  [K in PluginId<P>]: ResolvedAPIPluginRuntimeSettings
}

export type APISettings<P extends APIPluginList = []> = {
  /**
   * Output parsing mode. Defaults to `awaited`.
   */
  output: OutputSetting
  /**
   * Runtime settings keyed by plugin id.
   */
  plugins?: APIPluginSettingsById<P>
}

export type DefaultAPISettings<P extends APIPluginList = []> = {
  output: 'awaited'
  plugins?: APIPluginSettingsById<P>
}

export type APIMeta<M extends Middleware, S extends APISettings = DefaultAPISettings, P extends APIPluginList = []> = {
  middleware: M
  settings: S
  plugins: {
    list: P
    registry: APIPluginRegistry<P>
    settings: ResolvedAPIPluginSettingsById<P>
    auto: readonly PluginId<P>[]
  }
}

export type APIRouterPluginContext<
  M extends Middleware = Middleware,
  UA extends UseBuilderArgs<M> | undefined = undefined,
  N extends string = string,
  S extends APISettings = APISettings,
  P extends APIPluginList = APIPluginList,
  RA extends UseBuilderArgs<M> | undefined = undefined,
> = {
  api: APIMeta<M, S, P>
  pluginId: PluginId<P>
  pluginSettings: ResolvedAPIPluginRuntimeSettings
  router: RouterBuilderMeta<M, UA, N>
  procedure: ProcedureBuilder<
    M,
    EffectiveRouterUseArgs<M, RA, UA>,
    undefined,
    undefined,
    undefined,
    N,
    S,
    P,
    PluginBuilderArgs<P>,
    undefined
  >
}

export type APIProcedurePluginContext<
  M extends Middleware = Middleware,
  IA extends UseBuilderArgs<M> | undefined = undefined,
  LA extends UseBuilderArgs<M> | undefined = undefined,
  SI extends Schema | undefined = Schema | undefined,
  SO extends Schema | undefined = Schema | undefined,
  RN extends string | undefined = string | undefined,
  S extends APISettings = APISettings,
  P extends APIPluginList = APIPluginList,
  N extends string | undefined = undefined,
  R = unknown,
  HR extends HTTPRoute | undefined = HTTPRoute | undefined,
> = {
  api: APIMeta<M, S, P>
  pluginId: PluginId<P>
  pluginSettings: ResolvedAPIPluginRuntimeSettings
  procedure: BaseProcedureHandler<M, IA, LA, SI, SO, RN, R, S, N, HR>
  meta: ProcedureHandlerMeta<M, IA, LA, SI, SO, RN, N, HR>
}

export type AnyAPIRouterPluginHook = (ctx: APIRouterPluginContext) => Record<string, unknown>

export type AnyAPIProcedurePluginHook = (ctx: APIProcedurePluginContext) => Record<string, unknown>

export type APIConfig<
  M extends Middleware = {},
  S extends APISettings = DefaultAPISettings,
  P extends APIPluginList = [],
> = {
  /**
   * Context factories available to `.use(...)`.
   */
  middleware?: M
  /**
   * Runtime behavior for output parsing and plugins.
   */
  settings?: Partial<S>
  /**
   * Plugin instances that can add helpers to routers and finalized procedures.
   */
  plugins?: P
}

type HasMiddleware<M extends Middleware> = keyof M extends never ? false : true

export type APIUseBuilder<M extends Middleware, S extends APISettings, P extends APIPluginList> = <
  UA extends UseBuilderArgs<M>,
>(
  ...selected: UA
) => API<M, S, P, UA>

export type API<
  M extends Middleware = {},
  S extends APISettings = DefaultAPISettings,
  P extends APIPluginList = [],
  UA extends UseBuilderArgs<M> | undefined = undefined,
> = (UA extends undefined
  ? HasMiddleware<M> extends true
    ? {
        /**
         * Selects middleware for every procedure and router created from the
         * returned API instance.
         *
         * @example
         * ```ts
         * const protectedApi = api.use('session')
         * ```
         */
        use: APIUseBuilder<M, S, P>
      }
    : {}
  : {}) & {
  /**
   * Runtime metadata for this configured API instance.
   */
  $meta: APIMeta<M, S, P>
  /**
   * Creates a standalone procedure.
   *
   * @example
   * ```ts
   * const ping = api.procedure.handler(() => 'pong')
   * ping()
   * ```
   */
  procedure: ProcedureBuilder<M, UA, undefined, undefined, undefined, undefined, S, P>
  /**
   * Creates a named router. Procedures defined inside a router receive stable
   * key helpers such as `users.byId.$key.root`.
   *
   * @example
   * ```ts
   * const users = api.router('users').define(({ procedure }) => ({
   *   byId: procedure.input(z.string()).handler(({ input }) => input),
   * }))
   * ```
   */
  router: <const N extends string>(name: N) => RouterBuilder<M, undefined, N, S, P, undefined, UA>
}
