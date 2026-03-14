import type { APIMeta, Middleware, Router, RouterConfig, Validator } from './types'
import { createMiddleware } from './helpers/middleware'

// The group function builder, both for top-level group imports and through api().group modifiers
export function routerCreator<AMI extends Middleware = never, AVI extends Validator = never>(meta: APIMeta<AMI, AVI>) {
  return function <const N extends string, MI extends Middleware = never>(config: RouterConfig<N, MI>): Router<N, MI, AMI> {
    const createMiddlewareFn = createMiddleware(meta.middleware, config.middleware)
    return {
      $meta: {
        name: config.name,
        middleware: {
          api: meta.middleware,
          router: config.middleware,
          merged: createMiddlewareFn,
        },
      },
    }
  }
}
