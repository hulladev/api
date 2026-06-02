import {
  attachProcedurePluginMembers,
  createPluginMeta,
  mergeSelections,
  procedurePluginIdsKey,
} from './helpers/plugins'
import {
  attachProcedureCoreMembers,
  createProcedureMeta,
  mergeMiddlewareSelection,
  resolveContext,
} from './helpers/procedure'
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
import type { APIPluginList, APISettings, APIMeta, DefaultAPISettings, Middleware, Schema } from './types.public'
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
>(
  meta: Pick<APIMeta<M, S, P>, 'middleware' | 'settings'> & Partial<Pick<APIMeta<M, S, P>, 'plugins'>>,
  state: ProcedureState<M, IA, LA, SI, SO, RN, P, IPA, LPA> = {
    inheritedUse: undefined,
    use: undefined,
    input: undefined,
    output: undefined,
    router: undefined,
    inheritedPlugins: undefined,
    plugins: undefined,
  } as ProcedureState<M, IA, LA, SI, SO, RN, P, IPA, LPA>
): ProcedureBuilder<M, IA, LA, SI, SO, RN, S, P, IPA, LPA> {
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
    return procedureBuilder<M, IA, UA, SI, SO, RN, S, P, IPA, LPA>(resolvedMeta, { ...state, use: nextUse })
  }

  const plugin = <const PA extends PluginBuilderArgs<P>>(...selectedPlugins: PA) => {
    return procedureBuilder<M, IA, LA, SI, SO, RN, S, P, IPA, PA>(resolvedMeta, { ...state, plugins: selectedPlugins })
  }

  const input = <const NSI extends Schema>(nextInput: NSI) => {
    return procedureBuilder<M, IA, LA, NSI, SO, RN, S, P, IPA, LPA>(resolvedMeta, { ...state, input: nextInput })
  }

  const output = <const NSO extends Schema>(nextOutput: NSO) => {
    return procedureBuilder<M, IA, LA, SI, NSO, RN, S, P, IPA, LPA>(resolvedMeta, { ...state, output: nextOutput })
  }

  const handler: ProcedureBuilder<M, IA, LA, SI, SO, RN, S, P, IPA, LPA>['handler'] = ((fn) => {
    const call = ((...args: unknown[]) => {
      const parsedInput = state.input === undefined ? undefined : state.input.parse(args[0] as never)
      const contextCache =
        selected === undefined ? undefined : resolveContext(resolvedMeta.middleware, selected as never)
      const result = fn({
        ...(selected === undefined ? {} : { getContext: () => contextCache }),
        ...(state.input === undefined ? {} : { input: parsedInput }),
      } as never)

      if (state.output === undefined) {
        return result
      }

      if (resolvedMeta.settings.output === 'raw') {
        return state.output.parse(result)
      }

      return isPromiseLike(result) ? result.then((value) => state.output!.parse(value)) : state.output.parse(result)
    }) as BaseProcedureHandler<M, IA, LA, SI, SO, RN, ReturnType<typeof fn>, S>['call']

    const runtimeHandler = {
      call,
    } as ProcedureHandler<M, IA, LA, SI, SO, RN, ReturnType<typeof fn>, S, undefined, P, typeof activePlugins>

    runtimeHandler.$meta = createProcedureMeta(state, selected) as typeof runtimeHandler.$meta
    attachProcedureCoreMembers(
      runtimeHandler as unknown as BaseProcedureHandler<M, IA, LA, SI, SO, RN, ReturnType<typeof fn>, S>
    )
    ;(runtimeHandler as unknown as Record<PropertyKey, unknown>)[procedurePluginIdsKey] = activePlugins as
      | readonly string[]
      | undefined

    if (state.router === undefined) {
      attachProcedurePluginMembers(
        resolvedMeta,
        runtimeHandler as unknown as Record<string, unknown>,
        (pluginDef, pluginSettings) => {
          return pluginDef.procedure?.({
            api: resolvedMeta,
            pluginId: pluginDef.id,
            pluginSettings,
            procedure: runtimeHandler as never,
            call: runtimeHandler.call as never,
            meta: runtimeHandler.$meta,
          }) as Record<string, unknown> | undefined
        },
        ['$meta', 'call', 'key']
      )
    }

    return runtimeHandler
  }) as ProcedureBuilder<M, IA, LA, SI, SO, RN, S, P, IPA, LPA>['handler']

  return {
    ...(state.use === undefined && hasMiddleware ? { use } : {}),
    ...(state.plugins === undefined && hasPlugins ? { plugin } : {}),
    ...(state.input === undefined ? { input } : {}),
    ...(state.output === undefined ? { output } : {}),
    handler,
    $meta: createProcedureMeta(state, selected),
  } as unknown as ProcedureBuilder<M, IA, LA, SI, SO, RN, S, P, IPA, LPA>
}
