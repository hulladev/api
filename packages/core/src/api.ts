import { createValidator } from './helpers/validator'
import { routerCreator } from './router'
import type { API, Middleware, ResolvedMiddleware, ResolvedValidator, Validator } from './types'

type ApiConfigShape = {
  middleware?: Middleware
  validator?: Validator
}

type InferMiddleware<C> = C extends { middleware?: infer MI extends Middleware } ? MI : never
type InferValidator<C> = C extends { validator?: infer VI extends Validator } ? VI : never

export function api<const C extends ApiConfigShape | undefined>(
  config?: C
): API<InferMiddleware<C>, InferValidator<C>> {
  const validator = createValidator(config?.validator) as ResolvedValidator<InferValidator<C>>
  if (!config?.middleware) {
    const middleware = undefined as ResolvedMiddleware<InferMiddleware<C>>

    return {
      router: routerCreator<InferMiddleware<C>, typeof validator>({ middleware, validator }),
      $meta: { middleware, validator },
    }
  }

  const middleware = config.middleware as ResolvedMiddleware<InferMiddleware<C>>

  return {
    router: routerCreator<InferMiddleware<C>, typeof validator>({ middleware, validator }),
    $meta: { middleware, validator },
  }
}
