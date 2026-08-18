import type { CompiledContractRoute } from './compiler'
import type { Contract } from './contract'

export type APIPluginTarget = 'client' | 'server' | 'universal'
export type APIPluginRuntimeTarget = Exclude<APIPluginTarget, 'universal'>

export type APIClientPluginRouteCall = (...args: readonly unknown[]) => Promise<unknown>

export type APIClientPluginRouteKey = {
  readonly root: string
  readonly full: (...args: readonly unknown[]) => readonly [string, ...unknown[]]
}

export type APIClientPluginRouteContext = {
  readonly contract: Contract
  readonly route: CompiledContractRoute
  readonly call: APIClientPluginRouteCall
  readonly hasInput: boolean
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

export type APIClientPluginRouteHook = (
  context: APIClientPluginRouteContext
) => Readonly<Record<string, unknown>> | undefined

export type APIClientPluginHooks<
  RouteHook extends APIClientPluginRouteHook | undefined = APIClientPluginRouteHook | undefined,
  RouteTypes extends Record<string, unknown> | undefined = Record<string, unknown> | undefined,
> = {
  readonly route?: RouteHook
  /** Type-only counterpart of the members returned by `route`. */
  readonly routeTypes?: RouteTypes
  readonly build?: (context: APIClientPluginBuildContext) => void
}

export type APIServerPluginHooks = {
  readonly build?: (context: APIServerPluginBuildContext) => void
}

export type APIPlugin<
  Id extends string = string,
  Target extends APIPluginTarget = APIPluginTarget,
  Namespace extends string = Id,
  ClientHooks extends APIClientPluginHooks | undefined = APIClientPluginHooks | undefined,
  ServerHooks extends APIServerPluginHooks | undefined = APIServerPluginHooks | undefined,
> = {
  readonly id: Id
  readonly target: Target
  /** Namespace for route extensions. Core exposes it with a `$` prefix and defaults it to `id`. */
  readonly namespace?: Namespace
  /** Requests the shared `$key` helper on compatible client route calls. */
  readonly routeKeys?: boolean
  readonly client?: ClientHooks
  readonly server?: ServerHooks
}

export type APIPluginList = readonly APIPlugin[]
export type APIClientPlugin = APIPlugin<string, 'client' | 'universal'>
export type APIServerPlugin = APIPlugin<string, 'server' | 'universal'>
export type APIClientPluginList = readonly APIClientPlugin[]
export type APIServerPluginList = readonly APIServerPlugin[]

export type APIClientRouteArgs = readonly [
  {
    readonly 'hulla.api.clientRouteArgs': 'args'
  },
]

export type APIClientRouteKey = readonly [string] & {
  readonly 'hulla.api.clientRouteKey': 'key'
}

export type APIClientRouteKeyRoot = string & {
  readonly 'hulla.api.clientRouteKeyRoot': 'key-root'
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

/** Keeps a third-party type opaque while core resolves a route type hook. */
export type APIPluginTypeOpaque<Value> = {
  readonly 'hulla.api.pluginTypeOpaque': Value
}

export function definePlugin<const Plugin extends APIPlugin>(plugin: Plugin): Plugin {
  return plugin
}
