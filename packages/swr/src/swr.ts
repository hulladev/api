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

export type SWRPluginConfig<Namespace extends string = 'swr'> = APIPluginRuntimeSettings & {
  readonly namespace?: Namespace
}

type SWRPluginContext = APIProcedurePluginContext

type SWRProcedureHook = (ctx: SWRPluginContext) => Record<string, unknown>

type SWRProcedureTypeHook = {
  queryOptions: APIProcedureIfInput<
    APIProcedureOverloads<
      [
        (...args: APIProcedureArgs) => readonly [APIProcedureKey, () => APIProcedureResult],
        () => readonly [readonly [APIProcedureKeyRoot], (...args: APIProcedureArgs) => APIProcedureResult],
      ]
    >,
    () => readonly [readonly [APIProcedureKeyRoot], () => APIProcedureResult]
  >
  mutationOptions: APIProcedureIfInput<
    APIProcedureOverloads<
      [
        (...args: APIProcedureArgs) => readonly [APIProcedureKey, () => APIProcedureResult],
        () => readonly [readonly [APIProcedureKeyRoot], (...args: APIProcedureArgs) => APIProcedureResult],
      ]
    >,
    () => readonly [readonly [APIProcedureKeyRoot], () => APIProcedureResult]
  >
}

type SWRPlugin<Namespace extends string> = APIPlugin<
  'swr',
  undefined,
  SWRProcedureHook,
  SWRProcedureTypeHook,
  Namespace
>

export function swrPlugin(config?: SWRPluginConfig<'swr'> & { readonly namespace?: undefined }): SWRPlugin<'swr'>
export function swrPlugin<const Namespace extends string>(
  config: SWRPluginConfig<Namespace> & { readonly namespace: Namespace }
): SWRPlugin<Namespace>
export function swrPlugin(config: SWRPluginConfig<string> = {}): SWRPlugin<string> {
  const procedure: SWRProcedureHook = (ctx) => {
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

    const options = ((...args: unknown[]) => {
      if (hasInput && args.length === 0) {
        return [
          [procedure.$key.root] as const,
          (...nextArgs: unknown[]) => ctx.procedure(...(nextArgs as [] | [unknown])),
        ] as const
      }

      return [
        procedure.$key.full(...(args as [] | [unknown])),
        () => ctx.procedure(...(args as [] | [unknown])),
      ] as const
    }) as unknown as SWRProcedureTypeHook['queryOptions']

    return {
      queryOptions: options,
      mutationOptions: options,
    }
  }

  return definePlugin({
    id: 'swr',
    namespace: config.namespace ?? 'swr',
    procedure,
    procedureTypes: undefined as unknown as SWRProcedureTypeHook,
    defaults: {
      inject: config.inject,
      aliases: config.aliases,
    },
    generation: {
      from: '@hulla/api-swr',
      name: 'swrPlugin',
      options: config,
    },
  } satisfies SWRPlugin<string>)
}
