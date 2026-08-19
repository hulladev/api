import { definePlugin } from '@hulla/api/plugin'
import type {
  APIClientPluginRouteHook,
  APIClientPluginRouterHook,
  APIClientRouteArgs,
  APIClientRouteIfInput,
  APIClientRouteKey,
  APIClientRouteKeyPrefix,
  APIClientRouteOverloads,
  APIClientRouteResult,
  APIPluginTypeOpaque,
  APIProcedureArgs,
  APIProcedureIfInput,
  APIProcedureKey,
  APIProcedureKeyPrefix,
  APIProcedureOverloads,
  APIProcedurePluginHook,
  APIProcedurePluginRouterHook,
  APIProcedureResult,
} from '@hulla/api/plugin'

export type TanStackQueryFunctionContext = {
  readonly signal?: AbortSignal
}

type QueryClientRouteTypes = {
  readonly queryKey: APIClientRouteIfInput<
    APIClientRouteOverloads<
      readonly [(...args: APIClientRouteArgs) => APIClientRouteKey, () => APIClientRouteKeyPrefix]
    >,
    () => APIClientRouteKeyPrefix
  >
  readonly queryOptions: APIClientRouteIfInput<
    (...args: APIClientRouteArgs) => {
      readonly queryKey: APIClientRouteKey
      readonly queryFn: (context?: APIPluginTypeOpaque<TanStackQueryFunctionContext>) => APIClientRouteResult
    },
    () => {
      readonly queryKey: APIClientRouteKeyPrefix
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
          readonly mutationKey: APIClientRouteKeyPrefix
          readonly mutationFn: (...args: APIClientRouteArgs) => APIClientRouteResult
        },
      ]
    >,
    () => {
      readonly mutationKey: APIClientRouteKeyPrefix
      readonly mutationFn: () => APIClientRouteResult
    }
  >
}

type QueryClientRouteHook = APIClientPluginRouteHook<QueryClientRouteTypes>

type QueryClientRouterTypes = {
  readonly queryKey: () => APIClientRouteKeyPrefix
}

type QueryClientRouterHook = APIClientPluginRouterHook<QueryClientRouterTypes>

type QueryProcedureTypes = {
  readonly queryKey: APIProcedureIfInput<
    APIProcedureOverloads<readonly [(...args: APIProcedureArgs) => APIProcedureKey, () => APIProcedureKeyPrefix]>,
    () => APIProcedureKeyPrefix
  >
  readonly queryOptions: APIProcedureIfInput<
    (...args: APIProcedureArgs) => {
      readonly queryKey: APIProcedureKey
      readonly queryFn: (context?: APIPluginTypeOpaque<TanStackQueryFunctionContext>) => APIProcedureResult
    },
    () => {
      readonly queryKey: APIProcedureKeyPrefix
      readonly queryFn: (context?: APIPluginTypeOpaque<TanStackQueryFunctionContext>) => APIProcedureResult
    }
  >
  readonly mutationOptions: APIProcedureIfInput<
    APIProcedureOverloads<
      readonly [
        (...args: APIProcedureArgs) => {
          readonly mutationKey: APIProcedureKey
          readonly mutationFn: () => APIProcedureResult
        },
        () => {
          readonly mutationKey: APIProcedureKeyPrefix
          readonly mutationFn: (...args: APIProcedureArgs) => APIProcedureResult
        },
      ]
    >,
    () => {
      readonly mutationKey: APIProcedureKeyPrefix
      readonly mutationFn: () => APIProcedureResult
    }
  >
}

type QueryProcedureHook = APIProcedurePluginHook<QueryProcedureTypes>

type QueryProcedureRouterTypes = {
  readonly queryKey: () => APIProcedureKeyPrefix
}

type QueryProcedureRouterHook = APIProcedurePluginRouterHook<QueryProcedureRouterTypes>

export function tanstackQueryPlugin() {
  const route: QueryClientRouteHook = (context) => {
    const queryKey = (...args: readonly unknown[]) => context.key.full(...args)

    const queryOptions = (...args: readonly unknown[]) => {
      if (context.hasInput && args.length === 0) {
        throw new TypeError('$queryOptions() requires the route input so its query can be executed deterministically.')
      }

      return {
        queryKey: queryKey(...args),
        queryFn: (queryContext?: TanStackQueryFunctionContext) =>
          context.hasInput
            ? context.call(args[0], { signal: queryContext?.signal })
            : context.call({ signal: queryContext?.signal }),
      }
    }

    const mutationOptions = (...args: readonly unknown[]) => {
      if (context.hasInput && args.length === 0) {
        return {
          mutationKey: context.key.prefix,
          mutationFn: (...nextArgs: readonly unknown[]) => context.call(nextArgs[0]),
        }
      }

      return {
        mutationKey: context.key.full(...args),
        mutationFn: () => (context.hasInput ? context.call(args[0]) : context.call()),
      }
    }

    return { queryKey, queryOptions, mutationOptions }
  }

  const router: QueryClientRouterHook = (context) => ({
    queryKey: () => context.key.full(),
  })

  const procedure: QueryProcedureHook = (context) => {
    const queryKey = (...args: readonly unknown[]) => context.key.full(...args)

    const queryOptions = (...args: readonly unknown[]) => {
      if (context.hasInput && args.length === 0) {
        throw new TypeError(
          '$queryOptions() requires the procedure input so its query can be executed deterministically.'
        )
      }

      return {
        queryKey: queryKey(...args),
        queryFn: () => (context.hasInput ? context.call(args[0]) : context.call()),
      }
    }

    const mutationOptions = (...args: readonly unknown[]) => {
      if (context.hasInput && args.length === 0) {
        return {
          mutationKey: context.key.prefix,
          mutationFn: (...nextArgs: readonly unknown[]) => context.call(nextArgs[0]),
        }
      }

      return {
        mutationKey: context.key.full(...args),
        mutationFn: () => (context.hasInput ? context.call(args[0]) : context.call()),
      }
    }

    return { queryKey, queryOptions, mutationOptions }
  }

  const procedureRouter: QueryProcedureRouterHook = (context) => ({
    queryKey: () => context.key.full(),
  })

  return definePlugin({
    id: 'tanstackQuery',
    client: {
      route,
      router,
    },
    procedures: {
      procedure,
      router: procedureRouter,
    },
  })
}
