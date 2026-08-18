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
  APIPluginTypeOpaque,
} from '@hulla/api/plugin'

export type TanStackQueryPluginConfig<Namespace extends string = 'tanstack'> = {
  readonly namespace?: Namespace
}

export type TanStackQueryFunctionContext = {
  readonly signal?: AbortSignal
}

type QueryProcedureTypeHook = {
  readonly queryOptions: APIClientRouteIfInput<
    (...args: APIClientRouteArgs) => {
      readonly queryKey: APIClientRouteKey
      readonly queryFn: (context?: APIPluginTypeOpaque<TanStackQueryFunctionContext>) => APIClientRouteResult
    },
    () => {
      readonly queryKey: readonly [APIClientRouteKeyRoot]
      readonly queryFn: (context?: APIPluginTypeOpaque<TanStackQueryFunctionContext>) => APIClientRouteResult
    }
  >
  readonly mutationOptions: APIClientRouteIfInput<
    APIClientRouteOverloads<
      readonly [
        (...args: APIClientRouteArgs) => {
          readonly mutationKey: APIClientRouteKey
          readonly mutationFn: () => APIClientRouteResult
        },
        () => {
          readonly mutationKey: readonly [APIClientRouteKeyRoot]
          readonly mutationFn: (...args: APIClientRouteArgs) => APIClientRouteResult
        },
      ]
    >,
    () => {
      readonly mutationKey: readonly [APIClientRouteKeyRoot]
      readonly mutationFn: () => APIClientRouteResult
    }
  >
}

type QueryHook = (context: APIClientPluginRouteContext) => {
  readonly queryOptions: (...args: readonly unknown[]) => unknown
  readonly mutationOptions: (...args: readonly unknown[]) => unknown
}

type QueryPlugin<Namespace extends string> = APIPlugin<
  'tanstackQuery',
  'client',
  Namespace,
  APIClientPluginHooks<QueryHook, QueryProcedureTypeHook>
> & {
  readonly routeKeys: true
  readonly client: APIClientPluginHooks<QueryHook, QueryProcedureTypeHook>
}

export function tanstackQueryPlugin(
  config?: TanStackQueryPluginConfig<'tanstack'> & { readonly namespace?: undefined }
): QueryPlugin<'tanstack'>
export function tanstackQueryPlugin<const Namespace extends string>(
  config: TanStackQueryPluginConfig<Namespace> & { readonly namespace: Namespace }
): QueryPlugin<Namespace>
export function tanstackQueryPlugin(config: TanStackQueryPluginConfig<string> = {}): QueryPlugin<string> {
  const route: QueryHook = (context) => {
    const queryOptions = (...args: readonly unknown[]) => {
      if (context.hasInput && args.length === 0) {
        throw new TypeError('queryOptions() requires the route input so its query can be executed deterministically.')
      }

      return {
        queryKey: context.key.full(...args),
        queryFn: (queryContext?: TanStackQueryFunctionContext) =>
          context.hasInput
            ? context.call(args[0], { signal: queryContext?.signal })
            : context.call({ signal: queryContext?.signal }),
      }
    }

    const mutationOptions = (...args: readonly unknown[]) => {
      if (context.hasInput && args.length === 0) {
        return {
          mutationKey: [context.key.root] as const,
          mutationFn: (...nextArgs: readonly unknown[]) => context.call(nextArgs[0]),
        }
      }

      return {
        mutationKey: context.key.full(...args),
        mutationFn: () => (context.hasInput ? context.call(args[0]) : context.call()),
      }
    }

    return { queryOptions, mutationOptions }
  }

  return definePlugin({
    id: 'tanstackQuery',
    target: 'client',
    namespace: config.namespace ?? 'tanstack',
    routeKeys: true,
    client: {
      route,
      routeTypes: undefined as unknown as QueryProcedureTypeHook,
    },
  }) as QueryPlugin<string>
}
