import { copyRecord, isRecord, setOwn } from './object'
import { assertRoutePath, conflictingPathParamNames, type PathParamOptions, type PathParamsFor } from './paths'
import type { Route, RouteMap } from './route'
import type { ObjectSchema } from './validation'

declare const routerRoutesType: unique symbol
declare const routerParamsType: unique symbol

const routeRouterParams = new WeakMap<Route, ObjectSchema>()

type DefinedField<Name extends PropertyKey, Value> = [Value] extends [undefined]
  ? object
  : undefined extends Value
    ? { readonly [Key in Name]?: Exclude<Value, undefined> }
    : { readonly [Key in Name]: Value }

type ScopedRoute<RouteType extends Route, Params extends ObjectSchema | undefined> = RouteType & {
  readonly [routerParamsType]?: Params
}

type RouterChildren<Routes extends RouteMap, Params extends ObjectSchema | undefined> = {
  readonly [Key in keyof Routes]: ScopedRoute<Routes[Key], Params>
}

export type RouterMetadata<
  Path extends string = string,
  Routes extends RouteMap = RouteMap,
  Params extends ObjectSchema | undefined = ObjectSchema | undefined,
> = {
  readonly kind: 'router'
  readonly path: Path
  readonly [routerRoutesType]?: Routes
} & DefinedField<'params', Params>

export type Router<
  Path extends string = string,
  Routes extends RouteMap = {},
  Params extends ObjectSchema | undefined = ObjectSchema | undefined,
> = RouterChildren<Routes, Params> & {
  readonly $meta: Readonly<RouterMetadata<Path, Routes, Params>>
}

export type AnyRouter = {
  readonly $meta: Readonly<RouterMetadata>
}

export type RouterOptions<
  Path extends string,
  Routes extends RouteMap,
  Params extends ObjectSchema | undefined = PathParamsFor<Path>,
> = {
  readonly routes: Routes
} & PathParamOptions<Path, Params>

export type RouterRoutes<RouterType extends AnyRouter> =
  RouterType extends Router<string, infer Routes, ObjectSchema | undefined> ? Routes : never

export type RouterParams<RouterType extends AnyRouter> =
  RouterType extends Router<string, RouteMap, infer Params> ? Params : never

export type RouterParamsForRoute<RouteType> = RouteType extends {
  readonly [routerParamsType]?: infer Params extends ObjectSchema | undefined
}
  ? Params
  : undefined

export function isRouter(value: unknown): value is AnyRouter {
  if (typeof value !== 'object' || value === null || Array.isArray(value)) return false
  const metadata = (value as { readonly $meta?: unknown }).$meta
  return (
    typeof metadata === 'object' && metadata !== null && (metadata as { readonly kind?: unknown }).kind === 'router'
  )
}

export function routerEntries(router: AnyRouter): readonly (readonly [string, Route])[] {
  return Object.entries(router) as unknown as readonly (readonly [string, Route])[]
}

export function routerRoutes(router: AnyRouter): Readonly<RouteMap> {
  return router as unknown as Readonly<RouteMap>
}

/** @internal Returns the router params associated with a router-scoped route value. */
export function routerParamsForRouteValue(route: Route): ObjectSchema | undefined {
  return routeRouterParams.get(route)
}

export function router<
  const Path extends string,
  const Routes extends RouteMap,
  const Params extends ObjectSchema | undefined = PathParamsFor<Path>,
>(path: Path, options: RouterOptions<Path, Routes, Params>): NoInfer<Router<Path, Routes, Params>> {
  assertRoutePath(path, 'Router path')
  if (!isRecord(options)) throw new TypeError('Router options must be an object')
  if (!isRecord(options.routes)) throw new TypeError('Router routes must be an object')
  if ('$meta' in options.routes) throw new TypeError('Router route name "$meta" is reserved')

  for (const [key, route] of Object.entries(options.routes)) {
    if (!isRecord(route) || route.kind !== 'route' || typeof route.path !== 'string') {
      throw new TypeError(`Router route "${key}" must be a route definition`)
    }
    const conflicts = conflictingPathParamNames(path, route.path)
    if (conflicts.length > 0) {
      throw new TypeError(
        `Router route "${key}" redeclares ${conflicts.length === 1 ? 'parameter' : 'parameters'} ${conflicts.map((name) => `"${name}"`).join(', ')}`
      )
    }
  }

  const metadata = Object.freeze({
    kind: 'router' as const,
    path,
    ...(options.params === undefined ? {} : { params: options.params as Params }),
  })
  const declaration: Record<string, unknown> = {}
  for (const [key, route] of Object.entries(options.routes)) {
    const scopedRoute = Object.freeze(
      copyRecord(route as unknown as Readonly<Record<string, unknown>>)
    ) as unknown as Route
    if (options.params !== undefined) routeRouterParams.set(scopedRoute, options.params)
    setOwn(declaration, key, scopedRoute)
  }

  Object.defineProperty(declaration, '$meta', {
    configurable: false,
    enumerable: false,
    value: metadata,
    writable: false,
  })

  return Object.freeze(declaration) as Router<Path, Routes, Params>
}
