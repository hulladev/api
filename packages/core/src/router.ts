import {
  attachProcedurePluginMembers,
  mergeSelections,
  procedurePluginIdsKey,
  resolveRouterPluginMembers,
} from './helpers/plugins'
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
import type {
  APIMeta,
  APIPluginList,
  APISettings,
  DefaultAPISettings,
  HTTPMethod,
  HTTPRoute,
  Middleware,
  RouterPreset,
} from './types.public'

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

  const define: RouterBuilder<M, UA, N, S, P, PA, RA>['define'] = ((
    buildOrPreset: ((builders: Record<string, unknown>) => Record<string, any>) | RouterPreset,
    customize?: (builders: Record<string, unknown>) => Record<string, any>
  ) => {
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
      route: undefined,
      inheritedPlugins: activePlugins as EffectiveRouterPluginArgs<P, S, PA>,
      plugins: undefined,
    })
    const route = <const Method extends HTTPMethod, const Path extends string>(method: Method, path: Path) => {
      assertHTTPRoute(method, path)
      return procedureBuilder<
        M,
        EffectiveRouterUseArgs<M, RA, UA>,
        undefined,
        undefined,
        undefined,
        N,
        S,
        P,
        EffectiveRouterPluginArgs<P, S, PA>,
        undefined,
        HTTPRoute<Method, Path>
      >(meta, {
        inheritedUse,
        use: undefined,
        input: undefined,
        output: undefined,
        router: state.name,
        route: { method, path },
        inheritedPlugins: activePlugins as EffectiveRouterPluginArgs<P, S, PA>,
        plugins: undefined,
      })
    }
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
        } as never) as Record<string, unknown> | undefined
      },
      ['procedure']
    )

    const builders = {
      procedure,
      route,
      ...pluginMembers,
    }
    const preset = isRouterPreset(buildOrPreset) ? buildOrPreset : undefined
    const defined: Record<string, any> = preset
      ? customize
        ? customize({ ...builders, generated: preset.create({ ...builders, $api: meta } as never) })
        : preset.create({ ...builders, $api: meta } as never)
      : (buildOrPreset as (builders: Record<string, unknown>) => Record<string, any>)(builders)
    for (const [name, route] of Object.entries(defined)) {
      if ('name' in route.$meta) {
        throw new Error(`Procedure "${String(route.$meta['name'])}" is already assigned to a router.`)
      }

      const namedRoute = ((...args: unknown[]) => route(...args)) as typeof route
      for (const property of Reflect.ownKeys(route)) {
        if (
          property === 'length' ||
          property === 'name' ||
          property === 'arguments' ||
          property === 'caller' ||
          property === 'prototype' ||
          property === '$meta' ||
          property === '$key' ||
          property === procedurePluginIdsKey
        ) {
          continue
        }
        Object.defineProperty(namedRoute, property, Object.getOwnPropertyDescriptor(route, property)!)
      }
      namedRoute.$meta = {
        ...route.$meta,
        name,
        router: state.name,
      }
      const activeProcedurePlugins = (route as unknown as { [procedurePluginIdsKey]?: readonly string[] })[
        procedurePluginIdsKey
      ]

      Object.defineProperty(namedRoute, procedurePluginIdsKey, {
        configurable: false,
        enumerable: false,
        value: activeProcedurePlugins,
        writable: false,
      })
      ;(defined as Record<string, typeof route>)[name] = namedRoute
      attachProcedureCoreMembers(namedRoute as never)

      attachProcedurePluginMembers(
        meta,
        namedRoute as unknown as Record<string, unknown>,
        (pluginDef, pluginSettings) => {
          return pluginDef.procedure?.({
            api: meta,
            pluginId: pluginDef.id,
            pluginSettings,
            procedure: namedRoute as never,
            meta: namedRoute.$meta as never,
          } as never) as Record<string, unknown> | undefined
        },
        ['$meta', '$key']
      )
    }

    Object.defineProperty(defined, Symbol.for('hulla.api.router-definition'), {
      configurable: false,
      enumerable: false,
      value: {
        api: meta,
        name: state.name,
        ...(preset?.$hulla.generation === undefined ? {} : { generation: preset.$hulla.generation }),
      },
      writable: false,
    })
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

function isRouterPreset(value: unknown): value is RouterPreset {
  return (
    typeof value === 'object' &&
    value !== null &&
    (value as { $hulla?: { kind?: unknown } }).$hulla?.kind === 'hulla.api.router-preset' &&
    typeof (value as { create?: unknown }).create === 'function'
  )
}

const httpMethods = new Set<HTTPMethod>([
  'CONNECT',
  'DELETE',
  'GET',
  'HEAD',
  'OPTIONS',
  'PATCH',
  'POST',
  'PUT',
  'QUERY',
  'TRACE',
])

function assertHTTPRoute(method: HTTPMethod, path: string) {
  if (!httpMethods.has(method)) throw new Error(`Unsupported HTTP method "${String(method)}"`)
  if (!path.startsWith('/')) throw new Error(`Route path "${path}" must start with "/"`)
  if (path.includes('?') || path.includes('#')) throw new Error(`Route path "${path}" cannot contain a query or hash`)
  if (path.includes('//')) throw new Error(`Route path "${path}" cannot contain empty segments`)
  if (path.length > 1 && path.endsWith('/')) throw new Error(`Route path "${path}" cannot end with "/"`)
  for (const segment of path.split('/').filter(Boolean)) {
    if (segment === '.' || segment === '..') throw new Error(`Route path "${path}" contains an unsafe segment`)
    if (segment.startsWith(':')) {
      if (!/^[A-Za-z_$][\w$]*$/.test(segment.slice(1)))
        throw new Error(`Route path "${path}" contains an invalid parameter`)
      continue
    }
    if (!/^[A-Za-z0-9._~-]+$/.test(segment)) throw new Error(`Route path "${path}" contains an unsafe static segment`)
  }
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
