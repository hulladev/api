import { definePlugin } from '@hulla/api/plugin'
import type {
  APIClientPluginHooks,
  APIClientPluginRouteContext,
  APIClientRouteArgs,
  APIClientRouteIfInput,
  APIClientRouteKey,
  APIClientRouteKeyRoot,
  APIClientRouteOverloads,
  APIClientRouteResult,
  APIPlugin,
} from '@hulla/api/plugin'

export type SWRPluginConfig<Namespace extends string = 'swr'> = {
  readonly namespace?: Namespace
}

type SWRProcedureTypeHook = {
  readonly queryOptions: APIClientRouteIfInput<
    APIClientRouteOverloads<
      readonly [
        (...args: APIClientRouteArgs) => readonly [APIClientRouteKey, () => APIClientRouteResult],
        () => readonly [readonly [APIClientRouteKeyRoot], (...args: APIClientRouteArgs) => APIClientRouteResult],
      ]
    >,
    () => readonly [readonly [APIClientRouteKeyRoot], () => APIClientRouteResult]
  >
  readonly mutationOptions: APIClientRouteIfInput<
    APIClientRouteOverloads<
      readonly [
        (...args: APIClientRouteArgs) => readonly [APIClientRouteKey, () => APIClientRouteResult],
        () => readonly [readonly [APIClientRouteKeyRoot], (...args: APIClientRouteArgs) => APIClientRouteResult],
      ]
    >,
    () => readonly [readonly [APIClientRouteKeyRoot], () => APIClientRouteResult]
  >
}

type SWRHook = (context: APIClientPluginRouteContext) => {
  readonly queryOptions: (...args: readonly unknown[]) => unknown
  readonly mutationOptions: (...args: readonly unknown[]) => unknown
}

type SWRPlugin<Namespace extends string> = APIPlugin<
  'swr',
  'client',
  Namespace,
  APIClientPluginHooks<SWRHook, SWRProcedureTypeHook>
> & {
  readonly routeKeys: true
  readonly client: APIClientPluginHooks<SWRHook, SWRProcedureTypeHook>
}

export function swrPlugin(config?: SWRPluginConfig<'swr'> & { readonly namespace?: undefined }): SWRPlugin<'swr'>
export function swrPlugin<const Namespace extends string>(
  config: SWRPluginConfig<Namespace> & { readonly namespace: Namespace }
): SWRPlugin<Namespace>
export function swrPlugin(config: SWRPluginConfig<string> = {}): SWRPlugin<string> {
  const route: SWRHook = (context) => {
    const options = (...args: readonly unknown[]) => {
      if (context.hasInput && args.length === 0) {
        return [[context.key.root] as const, (...nextArgs: readonly unknown[]) => context.call(nextArgs[0])] as const
      }

      return [context.key.full(...args), () => (context.hasInput ? context.call(args[0]) : context.call())] as const
    }

    return { queryOptions: options, mutationOptions: options }
  }

  return definePlugin({
    id: 'swr',
    target: 'client',
    namespace: config.namespace ?? 'swr',
    routeKeys: true,
    client: {
      route,
      routeTypes: undefined as unknown as SWRProcedureTypeHook,
    },
  }) as SWRPlugin<string>
}
