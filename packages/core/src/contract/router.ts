import { isRecord, setOwn } from '../object'
import type { ObjectSchema, SchemaInput, SchemaOutput } from '../validation'
import { assertRoutePath, conflictingPathParamNames, type PathParamOptions, type PathParamsFor } from './paths'
import type { Route } from './route'

declare const routerRoutesType: unique symbol
declare const routerParamsType: unique symbol

type DefinedField<Name extends PropertyKey, Value> = [Value] extends [undefined]
  ? object
  : undefined extends Value
    ? { readonly [Key in Name]?: Exclude<Value, undefined> }
    : { readonly [Key in Name]: Value }

type RouterDefinition = Route | AnyRouter

export type RouterRoutesMap = Readonly<Record<string, RouterDefinition>>

type MergeObjectSchemas<
  First extends ObjectSchema | undefined,
  Second extends ObjectSchema | undefined,
> = First extends ObjectSchema
  ? Second extends ObjectSchema
    ? ObjectSchema<SchemaInput<First> & SchemaInput<Second>, SchemaOutput<First> & SchemaOutput<Second>>
    : First
  : Second

/** Type-only inherited parameters, named for downstream declaration emission. */
export type RouterParameterScope<Params extends ObjectSchema | undefined> = {
  readonly [routerParamsType]: Params
}

type ScopedRoute<RouteType extends Route, Params extends ObjectSchema | undefined> = RouteType &
  RouterParameterScope<Params>

type ScopedDefinition<Definition, Params extends ObjectSchema | undefined> = Definition extends Route
  ? ScopedRoute<Definition, Params>
  : Definition extends Router<infer Path, infer Routes, infer OwnParams, infer InheritedParams>
    ? Router<Path, Routes, OwnParams, MergeObjectSchemas<Params, InheritedParams>>
    : never

type RouterChildren<Routes extends RouterRoutesMap, Params extends ObjectSchema | undefined> = {
  readonly [Key in keyof Routes]: ScopedDefinition<Routes[Key], Params>
}

export type RouterMetadata<
  Path extends string = string,
  Routes extends RouterRoutesMap = RouterRoutesMap,
  Params extends ObjectSchema | undefined = ObjectSchema | undefined,
> = {
  readonly kind: 'router'
  readonly path: Path
  readonly [routerRoutesType]?: Routes
} & DefinedField<'params', Params>

export type Router<
  Path extends string = string,
  Routes extends RouterRoutesMap = {},
  Params extends ObjectSchema | undefined = ObjectSchema | undefined,
  InheritedParams extends ObjectSchema | undefined = undefined,
> = RouterChildren<Routes, MergeObjectSchemas<InheritedParams, Params>> & {
  readonly $meta: Readonly<RouterMetadata<Path, Routes, Params>>
}

export type AnyRouter = {
  readonly $meta: Readonly<RouterMetadata>
}

export type RouterOptions<
  Path extends string,
  Routes extends RouterRoutesMap,
  Params extends ObjectSchema | undefined = PathParamsFor<Path>,
> = {
  readonly routes: Routes
} & PathParamOptions<Path, Params>

export type RouterRoutes<RouterType extends AnyRouter> =
  RouterType extends Router<string, infer Routes, ObjectSchema | undefined, ObjectSchema | undefined> ? Routes : never

export type RouterChildrenFor<RouterType extends AnyRouter> = {
  readonly [Key in keyof RouterRoutes<RouterType>]: Key extends keyof RouterType
    ? Extract<RouterType[Key], RouterDefinition>
    : never
}

export type RouterParams<RouterType extends AnyRouter> =
  RouterType extends Router<string, RouterRoutesMap, infer Params, ObjectSchema | undefined> ? Params : never

export type RouterParamsForRoute<RouteType> = RouteType extends {
  readonly [routerParamsType]: infer Params extends ObjectSchema | undefined
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

export function routerRoutes(router: AnyRouter): Readonly<RouterRoutesMap> {
  return router as unknown as Readonly<RouterRoutesMap>
}

export function router<
  const Path extends string,
  const Routes extends RouterRoutesMap,
  const Params extends ObjectSchema | undefined = PathParamsFor<Path>,
>(path: Path, options: RouterOptions<Path, Routes, Params>): NoInfer<Router<Path, Routes, Params>> {
  assertRoutePath(path, 'Router path')
  if (!isRecord(options)) throw new TypeError('Router options must be an object')
  if (!isRecord(options.routes)) throw new TypeError('Router routes must be an object')
  if ('$meta' in options.routes) throw new TypeError('Router route name "$meta" is reserved')

  for (const [key, definition] of Object.entries(options.routes)) {
    const nestedRouter = isRouter(definition)
    const childPath = nestedRouter ? definition.$meta.path : isRecord(definition) ? definition['path'] : undefined
    if (!isRecord(definition) || (!nestedRouter && definition['kind'] !== 'route') || typeof childPath !== 'string') {
      throw new TypeError(`Router member "${key}" must be a route or router definition`)
    }
    const conflicts = conflictingPathParamNames(path, childPath)
    if (conflicts.length > 0) {
      throw new TypeError(
        `Router member "${key}" redeclares ${conflicts.length === 1 ? 'parameter' : 'parameters'} ${conflicts.map((name) => `"${name}"`).join(', ')}`
      )
    }
  }

  const metadata = Object.freeze({
    kind: 'router' as const,
    path,
    ...(options.params === undefined ? {} : { params: options.params as Params }),
  })
  const declaration: Record<string, unknown> = {}
  for (const [key, definition] of Object.entries(options.routes)) setOwn(declaration, key, definition)

  Object.defineProperty(declaration, '$meta', {
    configurable: false,
    enumerable: false,
    value: metadata,
    writable: false,
  })

  return Object.freeze(declaration) as Router<Path, Routes, Params>
}
