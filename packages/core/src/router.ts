import type { PathParamOptions, PathParamsFor } from './paths'
import type { RouteMap } from './route'
import type { ObjectSchema } from './validation'

export type Router<
  Path extends string = string,
  Routes extends RouteMap = RouteMap,
  Params extends ObjectSchema | undefined = ObjectSchema | undefined,
> = {
  readonly kind: 'router'
  readonly path: Path
  readonly params: Params
  readonly routes: Readonly<Routes>
}

export type RouterOptions<
  Path extends string,
  Routes extends RouteMap,
  Params extends ObjectSchema | undefined = PathParamsFor<Path>,
> = {
  readonly routes: Routes
} & PathParamOptions<Path, Params>

export function router<
  const Path extends string,
  const Routes extends RouteMap,
  const Params extends ObjectSchema | undefined = PathParamsFor<Path>,
>(path: Path, options: RouterOptions<Path, Routes, Params>): Router<Path, Routes, Params> {
  return Object.freeze({
    kind: 'router',
    path,
    params: options.params as Params,
    routes: Object.freeze({ ...options.routes }) as Readonly<Routes>,
  })
}
