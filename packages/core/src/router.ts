import { attachProcedurePluginMembers, mergeSelections, resolveRouterPluginMembers } from './helpers/plugins'
import { attachProcedureCoreMembers, mergeMiddlewareSelection } from './helpers/procedure'
import { procedureBuilder } from './procedure'
import type {
  EffectiveRouterUseArgs,
  EffectiveRouterPluginArgs,
  PluginBuilderArgs,
  RouterBuilder,
  RouterState,
  UseBuilderArgs,
} from './types.private'
import type { APIMeta, APIPluginList, APISettings, DefaultAPISettings, Middleware } from './types.public'

function routerBuilder<
  const M extends Middleware,
  UA extends UseBuilderArgs<M> | undefined,
  const N extends string,
  S extends APISettings = DefaultAPISettings,
  P extends APIPluginList = [],
  PA extends PluginBuilderArgs<P> | undefined = undefined,
  RA extends UseBuilderArgs<M> | undefined = undefined,
>(meta: APIMeta<M, S, P>, state: RouterState<M, UA, N, P, PA, RA>): RouterBuilder<M, UA, N, S, P, PA, RA> {
  const hasMiddleware = Object.keys(meta.middleware).length > 0
  const hasPlugins = meta.plugins.list.length > 0
  const inheritedUse = mergeMiddlewareSelection(state.rootUse, state.use) as EffectiveRouterUseArgs<M, RA, UA>
  const activePlugins = mergeSelections(
    meta.plugins.auto as readonly string[],
    state.plugins as readonly string[] | undefined
  ) as EffectiveRouterPluginArgs<P, S, PA> | undefined

  const use = <const SM extends UseBuilderArgs<M>>(...selected: SM) => {
    return routerBuilder<M, SM, N, S, P, PA, RA>(meta, { ...state, use: selected })
  }

  const plugin = <const SP extends PluginBuilderArgs<P>>(...selected: SP) => {
    return routerBuilder<M, UA, N, S, P, SP, RA>(meta, { ...state, plugins: selected })
  }

  const define: RouterBuilder<M, UA, N, S, P, PA, RA>['define'] = ((build) => {
    const procedure = procedureBuilder<
      M,
      EffectiveRouterUseArgs<M, RA, UA>,
      undefined,
      undefined,
      undefined,
      N,
      S,
      P,
      EffectiveRouterPluginArgs<P, S, PA>,
      undefined
    >(meta, {
      inheritedUse,
      use: undefined,
      input: undefined,
      output: undefined,
      router: state.name,
      inheritedPlugins: activePlugins as EffectiveRouterPluginArgs<P, S, PA>,
      plugins: undefined,
    })
    const pluginMembers = resolveRouterPluginMembers(
      meta,
      activePlugins as readonly string[] | undefined,
      (pluginDef, pluginSettings) => {
        return pluginDef.router?.({
          api: meta,
          pluginId: pluginDef.id,
          pluginSettings,
          router: {
            type: 'router',
            name: state.name,
            middleware: (state.use ?? []) as RouterBuilder<M, UA, N, S, P, PA, RA>['$meta']['middleware'],
          },
          procedure,
        }) as Record<string, unknown> | undefined
      },
      ['procedure']
    )

    const defined = build({
      procedure,
      ...pluginMembers,
    })
    for (const [name, route] of Object.entries(defined)) {
      route.$meta = {
        ...route.$meta,
        name,
        router: state.name,
      } as typeof route.$meta
      attachProcedureCoreMembers(route as never)

      attachProcedurePluginMembers(
        meta,
        route as unknown as Record<string, unknown>,
        (pluginDef, pluginSettings) => {
          return pluginDef.procedure?.({
            api: meta,
            pluginId: pluginDef.id,
            pluginSettings,
            procedure: route as never,
            call: route.call as never,
            meta: route.$meta as never,
          }) as Record<string, unknown> | undefined
        },
        ['$meta', 'call', 'key']
      )
    }

    return defined as ReturnType<typeof define>
  }) as RouterBuilder<M, UA, N, S, P, PA, RA>['define']

  return {
    ...(state.use === undefined && hasMiddleware ? { use } : {}),
    ...(state.plugins === undefined && hasPlugins ? { plugin } : {}),
    define,
    $meta: {
      type: 'router',
      name: state.name,
      middleware: (state.use ?? []) as RouterBuilder<M, UA, N, S, P, PA, RA>['$meta']['middleware'],
    },
  } as unknown as RouterBuilder<M, UA, N, S, P, PA, RA>
}

export function initRouterBuilder<
  M extends Middleware,
  S extends APISettings = DefaultAPISettings,
  P extends APIPluginList = [],
  RA extends UseBuilderArgs<M> | undefined = undefined,
>(meta: APIMeta<M, S, P>, rootUse?: RA) {
  return function router<const N extends string>(name: N) {
    return routerBuilder<M, undefined, N, S, P, undefined, RA>(meta, {
      name,
      rootUse: rootUse as RA,
      use: undefined,
      plugins: undefined,
    })
  }
}
