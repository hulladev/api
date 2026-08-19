import type { CompiledContractRoute } from './compiler'
import type { Contract } from './contract'

export type APIClientPluginRouteCall = (...args: readonly unknown[]) => Promise<unknown>

export type APIClientPluginRouteKey = {
  readonly prefix: readonly string[]
  readonly full: (...args: readonly unknown[]) => readonly unknown[]
}

export type APIClientPluginRouteContext = {
  readonly contract: Contract
  readonly route: CompiledContractRoute
  readonly call: APIClientPluginRouteCall
  readonly hasInput: boolean
  readonly key: APIClientPluginRouteKey
}

export type APIClientPluginRouterContext = {
  readonly contract: Contract
  readonly key: APIClientPluginRouteKey
}

export type APIClientPluginBuildContext = {
  readonly contract: Contract
  readonly routes: Readonly<Record<string, unknown>>
}

export type APIServerPluginBuildContext = {
  readonly contract: Contract
  readonly handlers: Readonly<Record<string, unknown>>
}

export type APIProcedurePluginCall = (...args: readonly unknown[]) => unknown

export type APIProcedurePluginKey = {
  readonly prefix: readonly string[]
  readonly full: (...args: readonly unknown[]) => readonly unknown[]
}

export type APIProcedurePluginContext = {
  readonly call: APIProcedurePluginCall
  readonly hasInput: boolean
  readonly key: APIProcedurePluginKey
}

export type APIProcedurePluginRouterContext = {
  readonly key: APIProcedurePluginKey
}

export type APIProcedurePluginBuildContext = {
  readonly procedures: Readonly<Record<string, unknown>>
}

type APIClientPluginRouteHookFunction = (
  context: APIClientPluginRouteContext
) => Readonly<Record<string, unknown>> | undefined

type APIClientPluginRouterHookFunction = (
  context: APIClientPluginRouterContext
) => Readonly<Record<string, unknown>> | undefined

export type APIClientPluginRouteHook<RouteTypes extends Record<string, unknown> = Record<string, unknown>> = ((
  context: APIClientPluginRouteContext
) =>
  | Readonly<{
      [Member in keyof RouteTypes]: unknown
    }>
  | undefined) & {
  /** Type-only map resolved against each route. This property does not exist at runtime. */
  readonly 'hulla.api.clientPluginRouteTypes'?: RouteTypes
}

export type APIClientPluginRouterHook<RouterTypes extends Record<string, unknown> = Record<string, unknown>> = ((
  context: APIClientPluginRouterContext
) =>
  | Readonly<{
      [Member in keyof RouterTypes]: unknown
    }>
  | undefined) & {
  /** Type-only map resolved against each router. This property does not exist at runtime. */
  readonly 'hulla.api.clientPluginRouterTypes'?: RouterTypes
}

export type APIClientPluginHooks<
  RouteHook extends APIClientPluginRouteHookFunction | undefined = APIClientPluginRouteHookFunction | undefined,
  RouterHook extends APIClientPluginRouterHookFunction | undefined = APIClientPluginRouterHookFunction | undefined,
> = {
  readonly route?: RouteHook
  readonly router?: RouterHook
  readonly build?: (context: APIClientPluginBuildContext) => void
}

export type APIServerPluginHooks = {
  readonly build?: (context: APIServerPluginBuildContext) => void
}

type APIProcedurePluginHookFunction = (
  context: APIProcedurePluginContext
) => Readonly<Record<string, unknown>> | undefined

type APIProcedurePluginRouterHookFunction = (
  context: APIProcedurePluginRouterContext
) => Readonly<Record<string, unknown>> | undefined

export type APIProcedurePluginHook<ProcedureTypes extends Record<string, unknown> = Record<string, unknown>> = ((
  context: APIProcedurePluginContext
) =>
  | Readonly<{
      [Member in keyof ProcedureTypes]: unknown
    }>
  | undefined) & {
  /** Type-only map resolved against each procedure. This property does not exist at runtime. */
  readonly 'hulla.api.procedurePluginTypes'?: ProcedureTypes
}

export type APIProcedurePluginRouterHook<RouterTypes extends Record<string, unknown> = Record<string, unknown>> = ((
  context: APIProcedurePluginRouterContext
) =>
  | Readonly<{
      [Member in keyof RouterTypes]: unknown
    }>
  | undefined) & {
  /** Type-only map resolved against each procedure router. This property does not exist at runtime. */
  readonly 'hulla.api.procedurePluginRouterTypes'?: RouterTypes
}

export type APIProcedurePluginHooks<
  ProcedureHook extends APIProcedurePluginHookFunction | undefined = APIProcedurePluginHookFunction | undefined,
  RouterHook extends APIProcedurePluginRouterHookFunction | undefined =
    | APIProcedurePluginRouterHookFunction
    | undefined,
> = {
  readonly procedure?: ProcedureHook
  readonly router?: RouterHook
  readonly build?: (context: APIProcedurePluginBuildContext) => void
}

type APIPluginShape = {
  readonly id: string
  readonly client?: APIClientPluginHooks
  readonly server?: APIServerPluginHooks
  readonly procedures?: APIProcedurePluginHooks
}

export type APIPlugin = APIPluginShape &
  (
    | { readonly client: APIClientPluginHooks }
    | { readonly server: APIServerPluginHooks }
    | { readonly procedures: APIProcedurePluginHooks }
  )

export type APIPluginList = readonly APIPlugin[]
export type APIClientPlugin = APIPlugin & { readonly client: APIClientPluginHooks }
export type APIServerPlugin = APIPlugin & { readonly server: APIServerPluginHooks }
export type APIProcedurePlugin = APIPlugin & { readonly procedures: APIProcedurePluginHooks }
export type APIClientPluginList = readonly APIClientPlugin[]
export type APIServerPluginList = readonly APIServerPlugin[]
export type APIProcedurePluginList = readonly APIProcedurePlugin[]

export type APIClientRouteArgs = readonly [
  {
    readonly 'hulla.api.clientRouteArgs': 'args'
  },
]

export type APIClientRouteKey = readonly [string] & {
  readonly 'hulla.api.clientRouteKey': 'key'
}

export type APIClientRouteKeyPrefix = readonly string[] & {
  readonly 'hulla.api.clientRouteKeyPrefix': 'key-prefix'
}

export type APIClientRouteResult = {
  readonly 'hulla.api.clientRouteResult': 'result'
}

export type APIClientRouteIfInput<WhenInput, WhenNoInput> = {
  readonly 'hulla.api.clientRouteIfInput': {
    readonly input: WhenInput
    readonly noInput: WhenNoInput
  }
}

export type APIClientRouteOverloads<Overloads extends readonly unknown[]> = {
  readonly 'hulla.api.clientRouteOverloads': Overloads
}

export type APIProcedureArgs = readonly [
  {
    readonly 'hulla.api.procedureArgs': 'args'
  },
]

export type APIProcedureKey = readonly [string] & {
  readonly 'hulla.api.procedureKey': 'key'
}

export type APIProcedureKeyPrefix = readonly string[] & {
  readonly 'hulla.api.procedureKeyPrefix': 'key-prefix'
}

export type APIProcedureResult = {
  readonly 'hulla.api.procedureResult': 'result'
}

export type APIProcedureIfInput<WhenInput, WhenNoInput> = {
  readonly 'hulla.api.procedureIfInput': {
    readonly input: WhenInput
    readonly noInput: WhenNoInput
  }
}

export type APIProcedureOverloads<Overloads extends readonly unknown[]> = {
  readonly 'hulla.api.procedureOverloads': Overloads
}

/** Keeps a third-party type opaque while core resolves a route type hook. */
export type APIPluginTypeOpaque<Value> = {
  readonly 'hulla.api.pluginTypeOpaque': Value
}

export function definePlugin<const Plugin extends APIPlugin>(plugin: Plugin): Plugin {
  return plugin
}
