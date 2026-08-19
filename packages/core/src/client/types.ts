import type { Contract, ContractRoutes } from '../contract'
import type { RouteInputSource } from '../input'
import type {
  APIClientPluginList,
  APIClientRouteArgs,
  APIClientRouteIfInput,
  APIClientRouteKey,
  APIClientRouteKeyPrefix,
  APIClientRouteOverloads,
  APIClientRouteResult,
  APIPluginTypeOpaque,
} from '../plugin'
import type { RouteResponses } from '../response'
import type { Route } from '../route'
import type { Router, RouterParamsForRoute } from '../router'
import type { ObjectSchema } from '../validation'
import type { ClientContextFactory } from './context'
import type { ClientMiddleware, ClientMiddlewareCandidate } from './middleware'
import type { ClientRequestOptions, ClientTransportOptions } from './request'
import type { ClientResponseResult } from './response'

export type ClientRouteInput<
  RouteType extends Route,
  RouterParams extends ObjectSchema | undefined = RouterParamsForRoute<RouteType>,
> = RouteInputSource<RouteType, RouterParams>

export type ClientRouteResult<ContractType extends Contract, RouteType extends Route> = RouteType extends {
  readonly responses: infer Responses extends RouteResponses
}
  ? ClientResponseResult<Responses> | ClientResponseResult<ContractType['errors']>
  : never

type ClientCallArguments<Input extends object> = keyof Input extends never
  ? readonly [options?: ClientRequestOptions]
  : readonly [input: Input, options?: ClientRequestOptions]

type PluginCallArguments<Input extends object> = keyof Input extends never ? readonly [] : readonly [input: Input]

type ResolvePluginArguments<
  Arguments,
  ContractType extends Contract,
  RouteType extends Route,
  RouterParams extends ObjectSchema | undefined,
  Key extends readonly string[],
> = [Arguments] extends [APIClientRouteArgs]
  ? PluginCallArguments<ClientRouteInput<RouteType, RouterParams>>
  : Arguments extends readonly unknown[]
    ? {
        [Index in keyof Arguments]: ResolvePluginRouteType<Arguments[Index], ContractType, RouteType, RouterParams, Key>
      }
    : never

type ResolvePluginRouteType<
  Value,
  ContractType extends Contract,
  RouteType extends Route,
  RouterParams extends ObjectSchema | undefined,
  Key extends readonly string[],
> = [Value] extends [APIClientRouteArgs]
  ? PluginCallArguments<ClientRouteInput<RouteType, RouterParams>>
  : [Value] extends [APIClientRouteIfInput<infer WhenInput, infer WhenNoInput>]
    ? keyof ClientRouteInput<RouteType, RouterParams> extends never
      ? ResolvePluginRouteType<WhenNoInput, ContractType, RouteType, RouterParams, Key>
      : ResolvePluginRouteType<WhenInput, ContractType, RouteType, RouterParams, Key>
    : [Value] extends [APIClientRouteOverloads<readonly [infer First, infer Second]>]
      ? ResolvePluginRouteType<First, ContractType, RouteType, RouterParams, Key> extends (
          ...args: infer FirstArguments
        ) => infer FirstResult
        ? ResolvePluginRouteType<Second, ContractType, RouteType, RouterParams, Key> extends (
            ...args: infer SecondArguments
          ) => infer SecondResult
          ? {
              (...args: SecondArguments): SecondResult
              (...args: FirstArguments): FirstResult
            }
          : never
        : never
      : [Value] extends [APIClientRouteKey]
        ? readonly [...Key, ...PluginCallArguments<ClientRouteInput<RouteType, RouterParams>>]
        : [Value] extends [APIClientRouteKeyPrefix]
          ? readonly [...Key]
          : [Value] extends [APIClientRouteResult]
            ? Promise<ClientRouteResult<ContractType, RouteType>>
            : Value extends APIPluginTypeOpaque<infer Opaque>
              ? Opaque
              : Value extends (...args: infer Arguments) => infer Result
                ? (
                    ...args: ResolvePluginArguments<Arguments, ContractType, RouteType, RouterParams, Key>
                  ) => ResolvePluginRouteType<Result, ContractType, RouteType, RouterParams, Key>
                : Value extends readonly unknown[]
                  ? {
                      [Index in keyof Value]: ResolvePluginRouteType<
                        Value[Index],
                        ContractType,
                        RouteType,
                        RouterParams,
                        Key
                      >
                    }
                  : Value extends object
                    ? {
                        [Member in keyof Value]: ResolvePluginRouteType<
                          Value[Member],
                          ContractType,
                          RouteType,
                          RouterParams,
                          Key
                        >
                      }
                    : Value

type HookTypeMap<Hook, Marker extends PropertyKey> = Marker extends keyof Hook
  ? Exclude<Hook[Marker], undefined>
  : never

type PluginRouteTypes<Plugin> = Plugin extends { readonly client?: infer Client }
  ? Exclude<Client, undefined> extends { readonly route?: infer Hook }
    ? HookTypeMap<Exclude<Hook, undefined>, 'hulla.api.clientPluginRouteTypes'>
    : never
  : never

type PrefixPluginMembers<Value> = Value extends object
  ? {
      readonly [Member in keyof Value as Member extends string ? `$${Member}` : never]: Value[Member]
    }
  : object

type PluginRouteExtension<
  Plugin,
  ContractType extends Contract,
  RouteType extends Route,
  RouterParams extends ObjectSchema | undefined,
  Key extends readonly string[],
> = [PluginRouteTypes<Plugin>] extends [never]
  ? object
  : PrefixPluginMembers<ResolvePluginRouteType<PluginRouteTypes<Plugin>, ContractType, RouteType, RouterParams, Key>>

type ResolvePluginRouterType<Value, Key extends readonly string[]> = [Value] extends [APIClientRouteKeyPrefix]
  ? readonly [...Key]
  : Value extends APIPluginTypeOpaque<infer Opaque>
    ? Opaque
    : Value extends (...args: infer Arguments) => infer Result
      ? (...args: Arguments) => ResolvePluginRouterType<Result, Key>
      : Value extends readonly unknown[]
        ? {
            [Index in keyof Value]: ResolvePluginRouterType<Value[Index], Key>
          }
        : Value extends object
          ? {
              [Member in keyof Value]: ResolvePluginRouterType<Value[Member], Key>
            }
          : Value

type PluginRouterTypes<Plugin> = Plugin extends { readonly client?: infer Client }
  ? Exclude<Client, undefined> extends { readonly router?: infer Hook }
    ? HookTypeMap<Exclude<Hook, undefined>, 'hulla.api.clientPluginRouterTypes'>
    : never
  : never

type PluginRouterExtension<Plugin, Key extends readonly string[]> = [PluginRouterTypes<Plugin>] extends [never]
  ? object
  : PrefixPluginMembers<ResolvePluginRouterType<PluginRouterTypes<Plugin>, Key>>

type UnionToIntersection<Union> = (Union extends unknown ? (value: Union) => void : never) extends (
  value: infer Intersection
) => void
  ? Intersection
  : never

type PluginRouteExtensions<
  Plugins extends APIClientPluginList,
  ContractType extends Contract,
  RouteType extends Route,
  RouterParams extends ObjectSchema | undefined,
  Key extends readonly string[],
> = UnionToIntersection<
  Plugins[number] extends infer Plugin
    ? PluginRouteExtension<Plugin, ContractType, RouteType, RouterParams, Key>
    : never
>

type PluginRouterExtensions<Plugins extends APIClientPluginList, Key extends readonly string[]> = UnionToIntersection<
  Plugins[number] extends infer Plugin ? PluginRouterExtension<Plugin, Key> : never
>

export type ClientRouteCall<
  ContractType extends Contract,
  RouteType extends Route,
  RouterParams extends ObjectSchema | undefined = RouterParamsForRoute<RouteType>,
> = (
  ...args: ClientCallArguments<ClientRouteInput<RouteType, RouterParams>>
) => Promise<ClientRouteResult<ContractType, RouteType>>

type ClientRouteWithPlugins<
  ContractType extends Contract,
  RouteType extends Route,
  RouterParams extends ObjectSchema | undefined,
  Plugins extends APIClientPluginList,
  Key extends readonly string[],
> = ClientRouteCall<ContractType, RouteType, RouterParams> &
  PluginRouteExtensions<Plugins, ContractType, RouteType, RouterParams, Key>

export type ClientRoutes<
  ContractType extends Contract,
  Routes extends ContractRoutes = ContractType['routes'],
  RouterParams extends ObjectSchema | undefined = undefined,
  Plugins extends APIClientPluginList = readonly [],
  KeyPrefix extends readonly string[] = readonly [],
> = {
  readonly [Key in keyof Routes]: Routes[Key] extends Route
    ? ClientRouteWithPlugins<
        ContractType,
        Routes[Key],
        RouterParams,
        Plugins,
        readonly [...KeyPrefix, Extract<Key, string>]
      >
    : Routes[Key] extends Router<string, infer NestedRoutes, infer NestedParams>
      ? ClientRoutes<ContractType, NestedRoutes, NestedParams, Plugins, readonly [...KeyPrefix, Extract<Key, string>]> &
          PluginRouterExtensions<Plugins, readonly [...KeyPrefix, Extract<Key, string>]>
      : never
}

export type DefineClientOptions<
  Context extends object,
  ContractType extends Contract = Contract,
  Plugins extends APIClientPluginList = readonly [],
> = ClientTransportOptions & {
  readonly context?: ClientContextFactory<Context, ContractType>
  readonly plugins?: Plugins
}

export type ClientDefinition<
  ContractType extends Contract,
  Context extends object,
  Plugins extends APIClientPluginList = readonly [],
> = {
  readonly contract: ContractType
  readonly context: ClientContextFactory<Context, ContractType> | undefined
  readonly middlewares: readonly ClientMiddleware<Context, ContractType>[]
  readonly plugins: Plugins
  readonly middleware: <const Handler extends ClientMiddlewareCandidate<NoInfer<Context>, NoInfer<ContractType>>>(
    middleware: Handler
  ) => Handler
  readonly use: <
    const Middlewares extends readonly ClientMiddlewareCandidate<NoInfer<Context>, NoInfer<ContractType>>[],
  >(
    ...middlewares: Middlewares
  ) => ClientDefinition<ContractType, Context, Plugins>
  readonly build: () => ClientRoutes<ContractType, ContractType['routes'], undefined, Plugins>
}

export type Client<
  ContractType extends Contract = Contract,
  Plugins extends APIClientPluginList = readonly [],
> = ClientRoutes<ContractType, ContractType['routes'], undefined, Plugins>
