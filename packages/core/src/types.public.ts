import type {
  BaseProcedureHandler,
  EffectiveRouterUseArgs,
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
 * const api = init({
 *   middleware: {
 *     session: getSession,
 *     admin: getAdminPermissions,
 *   },
 * })
 * ```
 */
export type Middleware = Record<string, () => unknown | Promise<unknown>>

/**
 * Minimal schema shape used by `.input(...)` and `.output(...)`.
 *
 * Zod schemas satisfy this shape, and custom validators can implement it too.
 */
export type Schema<Input = unknown, Output = Input> = {
  parse: (input: Input) => Output
  _input: Input
  _output: Output
}

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

export type AnyAPIRouterPluginHook = (ctx: any) => Record<string, unknown>

export type AnyAPIProcedurePluginHook = (ctx: any) => Record<string, unknown>

declare const apiProcedureArgsSymbol: unique symbol
declare const apiProcedureKeySymbol: unique symbol
declare const apiProcedureKeyRootSymbol: unique symbol
declare const apiProcedureResultSymbol: unique symbol
declare const apiProcedureIfInputSymbol: unique symbol
declare const apiProcedureOverloadsSymbol: unique symbol

export type APIProcedureArgs = readonly [
  {
    readonly [apiProcedureArgsSymbol]: 'args'
  },
]

export type APIProcedureKey = readonly [string] & {
  readonly [apiProcedureKeySymbol]: 'key'
}

export type APIProcedureKeyRoot = string & {
  readonly [apiProcedureKeyRootSymbol]: 'key-root'
}

export type APIProcedureResult = {
  readonly [apiProcedureResultSymbol]: 'result'
}

export type APIProcedureIfInput<WhenInput, WhenNoInput> = {
  readonly [apiProcedureIfInputSymbol]: {
    input: WhenInput
    noInput: WhenNoInput
  }
}

export type APIProcedureOverloads<T extends readonly unknown[]> = {
  readonly [apiProcedureOverloadsSymbol]: T
}

export type AnyAPIProcedurePluginTypeHook = Record<string, unknown>

export type APIPlugin<
  I extends string = string,
  RH extends AnyAPIRouterPluginHook | undefined = AnyAPIRouterPluginHook | undefined,
  PH extends AnyAPIProcedurePluginHook | undefined = AnyAPIProcedurePluginHook | undefined,
  PTH extends AnyAPIProcedurePluginTypeHook | undefined = AnyAPIProcedurePluginTypeHook | undefined,
> = {
  id: I
  router?: RH
  procedure?: PH
  procedureTypes?: PTH
}

export type APIPluginList = readonly APIPlugin<any, any, any, any>[]

export type APIPluginRegistry<P extends APIPluginList> = {
  [K in PluginId<P>]: Extract<P[number], { id: K }>
}

export type ResolvedAPIPluginSettingsById<P extends APIPluginList> = {
  [K in PluginId<P>]: ResolvedAPIPluginRuntimeSettings
}

export type PluginProcedureArgs<SI extends Schema | undefined> = SI extends Schema<infer I, any> ? [input: I] : []

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
  M extends Middleware,
  UA extends UseBuilderArgs<M> | undefined,
  N extends string,
  S extends APISettings,
  P extends APIPluginList = [],
  RA extends UseBuilderArgs<M> | undefined = undefined,
> = {
  api: APIMeta<M, S, P>
  pluginId: PluginId<P>
  pluginSettings: ResolvedAPIPluginRuntimeSettings
  router: RouterBuilderMeta<M, UA, N>
  procedure: ProcedureBuilder<M, EffectiveRouterUseArgs<M, RA, UA>, undefined, undefined, undefined, N, S, P, any, any>
}

export type APIProcedurePluginContext<
  M extends Middleware,
  IA extends UseBuilderArgs<M> | undefined,
  LA extends UseBuilderArgs<M> | undefined,
  SI extends Schema | undefined,
  SO extends Schema | undefined,
  RN extends string | undefined,
  S extends APISettings,
  P extends APIPluginList = [],
  N extends string | undefined = undefined,
  R = unknown,
> = {
  api: APIMeta<M, S, P>
  pluginId: PluginId<P>
  pluginSettings: ResolvedAPIPluginRuntimeSettings
  procedure: BaseProcedureHandler<M, IA, LA, SI, SO, RN, R, S, N>
  call: (...args: PluginProcedureArgs<SI>) => ReturnType<BaseProcedureHandler<M, IA, LA, SI, SO, RN, R, S, N>['call']>
  meta: ProcedureHandlerMeta<M, IA, LA, SI, SO, RN, N>
}

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
   * ping.call()
   * ```
   */
  procedure: ProcedureBuilder<M, UA, undefined, undefined, undefined, undefined, S, P>
  /**
   * Creates a named router. Procedures defined inside a router receive stable
   * key helpers such as `users.byId.key.root`.
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

export type RouterMeta<
  N extends string,
  M extends Middleware,
  S extends APISettings = DefaultAPISettings,
  P extends APIPluginList = [],
> = APIMeta<M, S, P> & {
  router: {
    name: N
  }
}
