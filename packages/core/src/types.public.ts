import type { BaseProcedureHandler, ProcedureBuilder, ProcedureHandlerMeta, RouterBuilder, RouterBuilderMeta, UseBuilderArgs } from './types.private'

export type Middleware = Record<string, () => unknown | Promise<unknown>>

export type Schema<Input = unknown, Output = Input> = {
  parse: (input: Input) => Output
  _input: Input
  _output: Output
}

export type OutputSetting = 'awaited' | 'raw'

export type PluginId<P extends APIPluginList> = P[number] extends infer Plugin
  ? Plugin extends { id: infer Id extends string }
    ? Id
    : never
  : never

export type APIPluginInjection = 'always' | 'opt-in'

export type APIPluginAliasMap = Record<string, string>

export type APIPluginRuntimeSettings = {
  inject?: APIPluginInjection
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
  output: OutputSetting
  plugins?: APIPluginSettingsById<P>
}

export type DefaultAPISettings<P extends APIPluginList = []> = {
  output: 'raw'
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
> = {
  api: APIMeta<M, S, P>
  pluginId: PluginId<P>
  pluginSettings: ResolvedAPIPluginRuntimeSettings
  router: RouterBuilderMeta<M, UA, N>
  procedure: ProcedureBuilder<M, UA, undefined, undefined, undefined, N, S, P, any, any>
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
  middleware?: M
  settings?: Partial<S>
  plugins?: P
}

export type API<
  M extends Middleware = {},
  S extends APISettings = DefaultAPISettings,
  P extends APIPluginList = [],
> = {
  $meta: APIMeta<M, S, P>
  procedure: ProcedureBuilder<M, undefined, undefined, undefined, undefined, undefined, S, P>
  router: <const N extends string>(name: N) => RouterBuilder<M, undefined, N, S, P>
}

export type RouterMeta<N extends string, M extends Middleware, S extends APISettings = DefaultAPISettings, P extends APIPluginList = []> =
  APIMeta<M, S, P> & {
    router: {
      name: N
    }
  }
