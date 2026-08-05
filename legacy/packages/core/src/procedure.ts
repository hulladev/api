import { ProcedureInputError, procedureExecuteKey } from './execution'
import { createPluginMeta, mergeSelections, procedurePluginIdsKey } from './helpers/plugins'
import {
  attachProcedureCoreMembers,
  createProcedureMeta,
  mergeMiddlewareSelection,
  resolveContext,
} from './helpers/procedure'
import { inputTupleSchema, isInputTupleSchema, namedInputTupleSchema } from './input'
import type {
  EffectiveUseBuilderArgs,
  EffectiveProcedurePluginArgs,
  BaseProcedureHandler,
  PluginBuilderArgs,
  ProcedureBuilder,
  ProcedureHandler,
  ProcedureState,
  UseBuilderArgs,
} from './types.private'
import type {
  APIPluginList,
  APISettings,
  APIMeta,
  DefaultAPISettings,
  HTTPRoute,
  Middleware,
  Schema,
} from './types.public'
import type { ProcedureExecutionContext } from './types.public'
import { isPromiseLike } from './utils/async'

export function procedureBuilder<
  const M extends Middleware,
  IA extends UseBuilderArgs<M> | undefined = undefined,
  LA extends UseBuilderArgs<M> | undefined = undefined,
  SI extends Schema | undefined = undefined,
  SO extends Schema | undefined = undefined,
  RN extends string | undefined = undefined,
  S extends APISettings = DefaultAPISettings,
  P extends APIPluginList = [],
  IPA extends PluginBuilderArgs<P> | undefined = undefined,
  LPA extends PluginBuilderArgs<P> | undefined = undefined,
  HR extends HTTPRoute | undefined = undefined,
>(
  meta: Pick<APIMeta<M, S, P>, 'middleware' | 'settings'> & Partial<Pick<APIMeta<M, S, P>, 'plugins'>>,
  state: ProcedureState<M, IA, LA, SI, SO, RN, P, IPA, LPA, HR> = {
    inheritedUse: undefined,
    use: undefined,
    input: undefined,
    output: undefined,
    router: undefined,
    route: undefined,
    inheritedPlugins: undefined,
    plugins: undefined,
  } as ProcedureState<M, IA, LA, SI, SO, RN, P, IPA, LPA, HR>
): ProcedureBuilder<M, IA, LA, SI, SO, RN, S, P, IPA, LPA, HR> {
  const resolvedMeta = (
    meta.plugins === undefined
      ? {
          ...meta,
          plugins: createPluginMeta(undefined as P | undefined, meta.settings.plugins),
        }
      : meta
  ) as APIMeta<M, S, P>
  const hasMiddleware = Object.keys(resolvedMeta.middleware).length > 0
  const hasPlugins = resolvedMeta.plugins.list.length > 0
  const selected = mergeMiddlewareSelection(state.inheritedUse, state.use) as EffectiveUseBuilderArgs<M, IA, LA>
  const activePlugins = mergeSelections(
    mergeSelections(
      resolvedMeta.plugins.auto as readonly string[],
      state.inheritedPlugins as readonly string[] | undefined
    ),
    state.plugins as readonly string[] | undefined
  ) as EffectiveProcedurePluginArgs<P, S, IPA, LPA>

  const use = <const UA extends UseBuilderArgs<M>>(...nextUse: UA) => {
    return procedureBuilder<M, IA, UA, SI, SO, RN, S, P, IPA, LPA, HR>(resolvedMeta, { ...state, use: nextUse })
  }

  const plugin = <const PA extends PluginBuilderArgs<P>>(...selectedPlugins: PA) => {
    return procedureBuilder<M, IA, LA, SI, SO, RN, S, P, IPA, PA, HR>(resolvedMeta, {
      ...state,
      plugins: selectedPlugins,
    })
  }

  const input = (...nextInputs: readonly Schema[]) => {
    const nextInput =
      nextInputs.length === 1 ? nextInputs[0]! : inputTupleSchema(nextInputs as readonly [Schema, Schema, ...Schema[]])
    return procedureBuilder(resolvedMeta, { ...state, input: nextInput })
  }
  input.$named = (...nextInputs: readonly [Schema, Schema, ...Schema[]]) => {
    return procedureBuilder(resolvedMeta, { ...state, input: namedInputTupleSchema(nextInputs) })
  }

  const output = <const NSO extends Schema>(nextOutput: NSO) => {
    return procedureBuilder<M, IA, LA, SI, NSO, RN, S, P, IPA, LPA, HR>(resolvedMeta, {
      ...state,
      output: nextOutput,
    })
  }

  const handler: ProcedureBuilder<M, IA, LA, SI, SO, RN, S, P, IPA, LPA, HR>['handler'] = ((fn) => {
    const execute = (
      args: readonly unknown[],
      executionContext: ProcedureExecutionContext,
      options?: { readonly inputParsed?: boolean; readonly parsedInput?: unknown }
    ) => {
      let parsedInput: unknown

      if (options?.inputParsed) {
        parsedInput = options.parsedInput
      } else {
        try {
          parsedInput =
            state.input === undefined
              ? undefined
              : state.input.parse((isInputTupleSchema(state.input) ? args : args[0]) as never)
        } catch (error) {
          throw new ProcedureInputError(error)
        }
      }

      const contextCache =
        selected === undefined
          ? undefined
          : resolveContext(resolvedMeta.middleware, selected as never, executionContext)
      const result = fn({
        ...(selected === undefined ? {} : { getContext: () => contextCache }),
        ...(state.input === undefined ? {} : { input: parsedInput }),
      } as never)

      if (state.output === undefined) {
        return result
      }

      if (resolvedMeta.settings.output === 'raw') {
        if (isPromiseLike(result) && state.output.parseAsync) return state.output.parseAsync(result)
        return state.output.parse(result)
      }

      return isPromiseLike(result)
        ? Promise.resolve(result).then((value) => state.output!.parse(value))
        : state.output.parse(result)
    }
    const runtimeHandler = ((...args: unknown[]) => execute(args, {})) as unknown as ProcedureHandler<
      M,
      IA,
      LA,
      SI,
      SO,
      RN,
      ReturnType<typeof fn>,
      S,
      undefined,
      P,
      typeof activePlugins,
      HR
    >

    ;(runtimeHandler as unknown as Record<PropertyKey, unknown>)[procedureExecuteKey] = execute
    runtimeHandler.$meta = createProcedureMeta(state, selected) as typeof runtimeHandler.$meta
    attachProcedureCoreMembers(
      runtimeHandler as unknown as BaseProcedureHandler<M, IA, LA, SI, SO, RN, ReturnType<typeof fn>, S, undefined, HR>
    )
    ;(runtimeHandler as unknown as Record<PropertyKey, unknown>)[procedurePluginIdsKey] = activePlugins as
      | readonly string[]
      | undefined

    return runtimeHandler
  }) as ProcedureBuilder<M, IA, LA, SI, SO, RN, S, P, IPA, LPA, HR>['handler']

  return {
    ...(state.use === undefined && hasMiddleware ? { use } : {}),
    ...(state.plugins === undefined && hasPlugins ? { plugin } : {}),
    ...(state.input === undefined ? { input } : {}),
    ...(state.output === undefined ? { output } : {}),
    handler,
    $meta: createProcedureMeta(state, selected),
  } as unknown as ProcedureBuilder<M, IA, LA, SI, SO, RN, S, P, IPA, LPA, HR>
}
