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

  return {
    $meta: meta,
    procedure: procedureBuilder<M, undefined, undefined, undefined, undefined, undefined, S, P>(meta),
    router: initRouterBuilder(meta),
  }
}
