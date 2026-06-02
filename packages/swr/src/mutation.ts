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

export type MutationPluginConfig = {}

type MutationPluginContext = APIProcedurePluginContext<any, any, any, any, any, any, any, any, any>

type MutationProcedureHook = (ctx: MutationPluginContext) => Record<string, unknown>

type MutationProcedureTypeHook = {
  mutation: {
    options: APIProcedureIfInput<
      APIProcedureOverloads<[
        (...args: APIProcedureArgs) => readonly [APIProcedureKey, () => APIProcedureResult],
        () => readonly [readonly [APIProcedureKeyRoot], (...args: APIProcedureArgs) => APIProcedureResult],
      ]>,
      () => readonly [readonly [APIProcedureKeyRoot], () => APIProcedureResult]
    >
  }
}

export function mutation(_config: MutationPluginConfig = {}) {
  const procedure: MutationProcedureHook = (ctx) => {
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

      return [
        procedure.key.full(...(args as [] | [unknown])),
        () => ctx.call(...(args as [] | [unknown])),
      ] as const
    }) as unknown as MutationProcedureTypeHook['mutation']['options']

    return {
      mutation: {
        options,
      },
    }
  }

  return {
    id: 'mutation',
    procedure,
    procedureTypes: undefined as unknown as MutationProcedureTypeHook,
  } satisfies APIPlugin<'mutation', undefined, MutationProcedureHook, MutationProcedureTypeHook>
}
