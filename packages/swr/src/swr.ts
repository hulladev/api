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

export type SWRPluginConfig = {}

type SWRPluginContext = APIProcedurePluginContext<any, any, any, any, any, any, any, any, any>

type SWRProcedureHook = (ctx: SWRPluginContext) => Record<string, unknown>

type SWRProcedureTypeHook = {
  query: {
    options: APIProcedureIfInput<
      APIProcedureOverloads<
        [
          (...args: APIProcedureArgs) => readonly [APIProcedureKey, () => APIProcedureResult],
          () => readonly [readonly [APIProcedureKeyRoot], (...args: APIProcedureArgs) => APIProcedureResult],
        ]
      >,
      () => readonly [readonly [APIProcedureKeyRoot], () => APIProcedureResult]
    >
  }
}

export function swr(_config: SWRPluginConfig = {}) {
  const procedure: SWRProcedureHook = (ctx) => {
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

    const options = ((...args: unknown[]) => {
      if (hasInput && args.length === 0) {
        return [
          [procedure.key.root] as const,
          (...nextArgs: unknown[]) => ctx.call(...(nextArgs as [] | [unknown])),
        ] as const
      }

      return [procedure.key.full(...(args as [] | [unknown])), () => ctx.call(...(args as [] | [unknown]))] as const
    }) as unknown as SWRProcedureTypeHook['query']['options']

    return {
      query: {
        options,
      },
    }
  }

  return {
    id: 'swr',
    procedure,
    procedureTypes: undefined as unknown as SWRProcedureTypeHook,
  } satisfies APIPlugin<'swr', undefined, SWRProcedureHook, SWRProcedureTypeHook>
}
