import { definePlugin } from '@hulla/api'
import type {
  APIPlugin,
  APIProcedureArgs,
  APIProcedureIfInput,
  APIProcedureKey,
  APIProcedureKeyRoot,
  APIProcedureOverloads,
  APIProcedurePluginContext,
  APIProcedureResult,
  APIPluginRuntimeSettings,
} from '@hulla/api/plugin'

export type TanStackQueryPluginConfig<Namespace extends string = 'tanstack'> = APIPluginRuntimeSettings & {
  readonly namespace?: Namespace
}

type QueryPluginContext = APIProcedurePluginContext

type QueryProcedureHook = (ctx: QueryPluginContext) => Record<string, unknown>

type QueryFunctionContext = {
  readonly signal?: AbortSignal
}

type QueryProcedureTypeHook = {
  queryOptions: APIProcedureIfInput<
    (...args: APIProcedureArgs) => {
      queryKey: APIProcedureKey
      queryFn: (context?: QueryFunctionContext) => APIProcedureResult
    },
    () => {
      queryKey: readonly [APIProcedureKeyRoot]
      queryFn: (context?: QueryFunctionContext) => APIProcedureResult
    }
  >
  mutationOptions: APIProcedureIfInput<
    APIProcedureOverloads<
      [
        (...args: APIProcedureArgs) => {
          mutationKey: APIProcedureKey
          mutationFn: () => APIProcedureResult
        },
        () => {
          mutationKey: readonly [APIProcedureKeyRoot]
          mutationFn: (...args: APIProcedureArgs) => APIProcedureResult
        },
      ]
    >,
    () => {
      mutationKey: readonly [APIProcedureKeyRoot]
      mutationFn: () => APIProcedureResult
    }
  >
}

type QueryPlugin<Namespace extends string> = APIPlugin<
  'tanstackQuery',
  undefined,
  QueryProcedureHook,
  QueryProcedureTypeHook,
  Namespace
>

export function tanstackQueryPlugin(
  config?: TanStackQueryPluginConfig<'tanstack'> & { readonly namespace?: undefined }
): QueryPlugin<'tanstack'>
export function tanstackQueryPlugin<const Namespace extends string>(
  config: TanStackQueryPluginConfig<Namespace> & { readonly namespace: Namespace }
): QueryPlugin<Namespace>
export function tanstackQueryPlugin(config: TanStackQueryPluginConfig<string> = {}): QueryPlugin<string> {
  const procedure: QueryProcedureHook = (ctx) => {
    if (!('$key' in ctx.procedure)) {
      return {}
    }

    const procedure = ctx.procedure as {
      $key: {
        root: string
        full: (...args: [] | [unknown]) => readonly [string, ...([] | [unknown])]
      }
    }
    const hasInput = ctx.meta.input !== undefined

    const queryOptions = ((...args: unknown[]) => {
      if (hasInput && args.length === 0) {
        throw new TypeError(
          'queryOptions() requires the procedure input so its query can be executed deterministically.'
        )
      }

      return {
        queryKey: procedure.$key.full(...(args as [] | [unknown])),
        queryFn: (queryContext?: QueryFunctionContext) =>
          invokeQuery(ctx.procedure, args as [] | [unknown], queryContext?.signal),
      }
    }) as unknown as QueryProcedureTypeHook['queryOptions']

    const mutationOptions = ((...args: unknown[]) => {
      if (hasInput && args.length === 0) {
        return {
          mutationKey: [procedure.$key.root] as const,
          mutationFn: (...nextArgs: unknown[]) => ctx.procedure(...(nextArgs as [] | [unknown])),
        }
      }

      return {
        mutationKey: procedure.$key.full(...(args as [] | [unknown])),
        mutationFn: () => ctx.procedure(...(args as [] | [unknown])),
      }
    }) as unknown as QueryProcedureTypeHook['mutationOptions']

    return {
      queryOptions,
      mutationOptions,
    }
  }

  return definePlugin({
    id: 'tanstackQuery',
    namespace: config.namespace ?? 'tanstack',
    procedure,
    procedureTypes: undefined as unknown as QueryProcedureTypeHook,
    defaults: {
      inject: config.inject,
      aliases: config.aliases,
    },
    generation: {
      from: '@hulla/api-tanstack-query',
      name: 'tanstackQueryPlugin',
      options: config,
    },
  } satisfies QueryPlugin<string>)
}

function invokeQuery(procedure: (...args: never[]) => unknown, args: [] | [unknown], signal?: AbortSignal): unknown {
  const request = (
    procedure as unknown as { request?: (options: { signal?: AbortSignal }, ...args: unknown[]) => unknown }
  ).request
  return request ? request({ signal }, ...args) : procedure(...(args as []))
}
