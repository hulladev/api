import { createPluginMeta } from './plugins'
import { procedureBuilder } from './procedure'
import { initRouterBuilder } from './router'
import type { API, APIConfig, APIMeta, APIPluginList, APISettings, DefaultAPISettings, Middleware } from './types.public'

const defaultSettings: DefaultAPISettings = {
  output: 'raw',
}

export function api<
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
