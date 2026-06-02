import { createPluginMeta } from './helpers/plugins'
import { defaultSettings } from './helpers/settings'
import { procedureBuilder } from './procedure'
import { initRouterBuilder } from './router'
import type {
  API,
  APIConfig,
  APIMeta,
  APIPluginList,
  APISettings,
  DefaultAPISettings,
  Middleware,
} from './types.public'
import type { UseBuilderArgs } from './types.private'

/**
 * Creates a configured Hulla API instance.
 *
 * Declare middleware, plugins, and settings once, then export the returned
 * instance from your app as `api`.
 *
 * @example
 * ```ts
 * import { init } from '@hulla/api'
 *
 * type Session = { userId: string }
 *
 * async function getSession(): Promise<Session> {
 *   return fetch('/api/session').then((res) => res.json())
 * }
 *
 * export const api = init({
 *   middleware: {
 *     session: getSession,
 *   },
 * })
 * ```
 */
export function init<
  M extends Middleware = {},
  const P extends APIPluginList = [],
  const S extends APISettings<P> = DefaultAPISettings<P>,
>(config?: APIConfig<M, S, P>): API<M, S, P> {
  const middleware = config?.middleware ?? ({} as M)
  const settings = {
    ...defaultSettings,
    ...config?.settings,
  } as S
  const meta: APIMeta<M, S, P> = {
    middleware,
    settings,
    plugins: createPluginMeta(config?.plugins, settings.plugins),
  }

  return createAPI(meta)
}

function createAPI<
  M extends Middleware,
  S extends APISettings,
  P extends APIPluginList,
  UA extends UseBuilderArgs<M> | undefined = undefined,
>(meta: APIMeta<M, S, P>, inheritedUse?: UA): API<M, S, P, UA> {
  const hasMiddleware = Object.keys(meta.middleware).length > 0
  const use = <const NUA extends UseBuilderArgs<M>>(...selected: NUA) => {
    return createAPI<M, S, P, NUA>(meta, selected)
  }

  return {
    ...(inheritedUse === undefined && hasMiddleware ? { use } : {}),
    $meta: meta,
    procedure: procedureBuilder<M, UA, undefined, undefined, undefined, undefined, S, P>(meta, {
      inheritedUse: inheritedUse as UA,
      use: undefined,
      input: undefined,
      output: undefined,
      router: undefined,
      inheritedPlugins: undefined,
      plugins: undefined,
    }),
    router: initRouterBuilder<M, S, P, UA>(meta, inheritedUse),
  } as unknown as API<M, S, P, UA>
}
