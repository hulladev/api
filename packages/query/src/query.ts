import type {
  APIPlugin,
  APIProcedureArgs,
  APIProcedureIfInput,
  APIProcedureKey,
  APIProcedureKeyRoot,
  APIProcedureOverloads,
  APIProcedurePluginContext,
  APIProcedureResult,
} from '@hulla/api'

export type QueryPluginConfig = {}

type QueryPluginContext = APIProcedurePluginContext<any, any, any, any, any, any, any, any, any>

type QueryProcedureHook = (ctx: QueryPluginContext) => Record<string, unknown>

type QueryProcedureTypeHook = {
  query: {
    options: APIProcedureIfInput<
      APIProcedureOverloads<
        [
          (...args: APIProcedureArgs) => {
            queryKey: APIProcedureKey
            queryFn: () => APIProcedureResult
          },
          () => {
            queryKey: readonly [APIProcedureKeyRoot]
            queryFn: (...args: APIProcedureArgs) => APIProcedureResult
          },
        ]
      >,
      () => {
        queryKey: readonly [APIProcedureKeyRoot]
        queryFn: () => APIProcedureResult
      }
    >
  }
  mutation: {
    options: APIProcedureIfInput<
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
}

export function query(_config: QueryPluginConfig = {}) {
  const procedure: QueryProcedureHook = (ctx) => {
    if (!('key' in ctx.procedure)) {
      return {}
    }

    const procedure = ctx.procedure as {
      key: {
        root: string
        full: (...args: [] | [unknown]) => readonly [string, ...([] | [unknown])]
      }
    }
    const hasInput = ctx.meta.input !== undefined

    const queryOptions = ((...args: unknown[]) => {
      if (hasInput && args.length === 0) {
        return {
          queryKey: [procedure.key.root] as const,
          queryFn: (...nextArgs: unknown[]) => ctx.call(...(nextArgs as [] | [unknown])),
        }
      }

      return {
        queryKey: procedure.key.full(...(args as [] | [unknown])),
        queryFn: () => ctx.call(...(args as [] | [unknown])),
      }
    }) as unknown as QueryProcedureTypeHook['query']['options']

    const mutationOptions = ((...args: unknown[]) => {
      if (hasInput && args.length === 0) {
        return {
          mutationKey: [procedure.key.root] as const,
          mutationFn: (...nextArgs: unknown[]) => ctx.call(...(nextArgs as [] | [unknown])),
        }
      }

      return {
        mutationKey: procedure.key.full(...(args as [] | [unknown])),
        mutationFn: () => ctx.call(...(args as [] | [unknown])),
      }
    }) as unknown as QueryProcedureTypeHook['mutation']['options']

    return {
      query: {
        options: queryOptions,
      },
      mutation: {
        options: mutationOptions,
      },
    }
  }

  return {
    id: 'query',
    procedure,
    procedureTypes: undefined as unknown as QueryProcedureTypeHook,
  } satisfies APIPlugin<'query', undefined, QueryProcedureHook, QueryProcedureTypeHook>
}
