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
  APIProcedureArgs,
  APIProcedureIfInput,
  APIProcedureKey,
  APIProcedureKeyPrefix,
  APIProcedureOverloads,
  APIProcedurePluginHook,
  APIProcedurePluginRouterHook,
  APIProcedureResult,
} from '@hulla/api/plugin'

type SWRClientRouteTypes = {
  readonly queryKey: APIClientRouteIfInput<
    APIClientRouteOverloads<
      readonly [(...args: APIClientRouteArgs) => APIClientRouteKey, () => APIClientRouteKeyPrefix]
    >,
    () => APIClientRouteKeyPrefix
  >
  readonly queryOptions: APIClientRouteIfInput<
    (...args: APIClientRouteArgs) => readonly [APIClientRouteKey, () => APIClientRouteResult],
    () => readonly [APIClientRouteKeyPrefix, () => APIClientRouteResult]
  >
  readonly mutationOptions: APIClientRouteIfInput<
    APIClientRouteOverloads<
      readonly [
        (...args: APIClientRouteArgs) => readonly [APIClientRouteKey, () => APIClientRouteResult],
        () => readonly [APIClientRouteKeyPrefix, (...args: APIClientRouteArgs) => APIClientRouteResult],
      ]
    >,
    () => readonly [APIClientRouteKeyPrefix, () => APIClientRouteResult]
  >
}

type SWRClientRouteHook = APIClientPluginRouteHook<SWRClientRouteTypes>

type SWRClientRouterTypes = {
  readonly queryKey: () => APIClientRouteKeyPrefix
}

type SWRClientRouterHook = APIClientPluginRouterHook<SWRClientRouterTypes>

type SWRProcedureTypes = {
  readonly queryKey: APIProcedureIfInput<
    APIProcedureOverloads<readonly [(...args: APIProcedureArgs) => APIProcedureKey, () => APIProcedureKeyPrefix]>,
    () => APIProcedureKeyPrefix
  >
  readonly queryOptions: APIProcedureIfInput<
    (...args: APIProcedureArgs) => readonly [APIProcedureKey, () => APIProcedureResult],
    () => readonly [APIProcedureKeyPrefix, () => APIProcedureResult]
  >
  readonly mutationOptions: APIProcedureIfInput<
    APIProcedureOverloads<
      readonly [
        (...args: APIProcedureArgs) => readonly [APIProcedureKey, () => APIProcedureResult],
        () => readonly [APIProcedureKeyPrefix, (...args: APIProcedureArgs) => APIProcedureResult],
      ]
    >,
    () => readonly [APIProcedureKeyPrefix, () => APIProcedureResult]
  >
}

type SWRProcedureHook = APIProcedurePluginHook<SWRProcedureTypes>

type SWRProcedureRouterTypes = {
  readonly queryKey: () => APIProcedureKeyPrefix
}

type SWRProcedureRouterHook = APIProcedurePluginRouterHook<SWRProcedureRouterTypes>

export function swrPlugin() {
  const route: SWRClientRouteHook = (context) => {
    const queryKey = (...args: readonly unknown[]) => context.key.full(...args)

    const queryOptions = (...args: readonly unknown[]) => {
      if (context.hasInput && args.length === 0) {
        throw new TypeError('$queryOptions() requires the route input so its query can be executed deterministically.')
      }

      return [queryKey(...args), () => (context.hasInput ? context.call(args[0]) : context.call())] as const
    }

    const mutationOptions = (...args: readonly unknown[]) => {
      if (context.hasInput && args.length === 0) {
        return [context.key.prefix, (...nextArgs: readonly unknown[]) => context.call(nextArgs[0])] as const
      }

      return [queryKey(...args), () => (context.hasInput ? context.call(args[0]) : context.call())] as const
    }

    return { queryKey, queryOptions, mutationOptions }
  }

  const router: SWRClientRouterHook = (context) => ({
    queryKey: () => context.key.full(),
  })

  const procedure: SWRProcedureHook = (context) => {
    const queryKey = (...args: readonly unknown[]) => context.key.full(...args)

    const queryOptions = (...args: readonly unknown[]) => {
      if (context.hasInput && args.length === 0) {
        throw new TypeError(
          '$queryOptions() requires the procedure input so its query can be executed deterministically.'
        )
      }

      return [queryKey(...args), () => (context.hasInput ? context.call(args[0]) : context.call())] as const
    }

    const mutationOptions = (...args: readonly unknown[]) => {
      if (context.hasInput && args.length === 0) {
        return [context.key.prefix, (...nextArgs: readonly unknown[]) => context.call(nextArgs[0])] as const
      }

      return [queryKey(...args), () => (context.hasInput ? context.call(args[0]) : context.call())] as const
    }

    return { queryKey, queryOptions, mutationOptions }
  }

  const procedureRouter: SWRProcedureRouterHook = (context) => ({
    queryKey: () => context.key.full(),
  })

  return definePlugin({
    id: 'swr',
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
