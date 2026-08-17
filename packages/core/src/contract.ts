import type { CompiledContractRoute, CompiledPathParameters } from './compiler'
import { getContractState } from './contract-state'
import { HTTP_METHODS, type HttpMethod } from './http'
import { isRecord } from './object'
import { assertBasePath, joinRoutePaths, pathParamNames, routePathShape } from './paths'
import type { RouteResponses } from './response'
import type { Route } from './route'
import { isRouter, routerEntries, type AnyRouter } from './router'
import type { ObjectSchema } from './validation'

export type ContractRoute = Route | AnyRouter

export type ContractRoutes = Readonly<Record<string, ContractRoute>>

export type Contract<
  BasePath extends string = string,
  Routes extends ContractRoutes = ContractRoutes,
  Errors extends RouteResponses = RouteResponses,
> = {
  readonly kind: 'contract'
  readonly basePath: BasePath
  readonly routes: Readonly<Routes>
  readonly errors: Readonly<Errors>
}

export type ContractOptions<
  BasePath extends string = string,
  Routes extends ContractRoutes = ContractRoutes,
  Errors extends RouteResponses = RouteResponses,
> = {
  readonly basePath?: BasePath
  readonly routes: Routes
  readonly errors?: Errors
}

type RegisteredRoute = {
  readonly name: string
  readonly method: HttpMethod
  readonly path: string
}

type RouteRegistry = {
  first?: RegisteredRoute
  routes?: Map<string, RegisteredRoute>
}

const emptyErrors = Object.freeze({}) as Readonly<RouteResponses>

function assertRoute(value: unknown, name: string): asserts value is Route {
  if (
    !isRecord(value) ||
    value['kind'] !== 'route' ||
    typeof value['method'] !== 'string' ||
    !HTTP_METHODS.includes(value['method'] as HttpMethod) ||
    typeof value['path'] !== 'string'
  ) {
    throw new TypeError(`Contract route "${name}" must be a route definition`)
  }
}

function assertRouter(value: unknown, name: string): asserts value is AnyRouter {
  if (!isRouter(value) || typeof value.$meta.path !== 'string') {
    throw new TypeError(`Contract router "${name}" must be a router definition`)
  }
}

function registerRoute(registry: RouteRegistry, name: string, path: string, route: Route): void {
  const registered: RegisteredRoute = { name, method: route.method, path }
  if (registry.first === undefined) {
    registry.first = registered
    return
  }

  let routes = registry.routes
  if (routes === undefined) {
    const first = registry.first
    routes = new Map([[`${first.method} ${routePathShape(first.path)}`, first]])
    registry.routes = routes
  }

  const signature = `${route.method} ${routePathShape(path)}`
  const existing = routes.get(signature)

  if (existing) {
    throw new TypeError(
      `Contract contains conflicting routes "${existing.name}" (${existing.method} ${existing.path}) and "${name}" (${route.method} ${path})`
    )
  }

  routes.set(signature, registered)
}

function compilePathParameters(path: string, schema: ObjectSchema | undefined): CompiledPathParameters | undefined {
  const names = pathParamNames(path)
  if (names.length === 0) return undefined
  if (schema === undefined) throw new TypeError(`Contract route path "${path}" is missing a parameter schema`)
  return { path, names, schema }
}

function compiledRoute(
  key: readonly string[],
  path: string,
  pathParameters: readonly CompiledPathParameters[],
  route: Route
): CompiledContractRoute {
  const ownParameters = compilePathParameters(route.path, 'params' in route ? route.params : undefined)
  return {
    key,
    method: route.method,
    path,
    pathParameters: ownParameters === undefined ? [...pathParameters] : [...pathParameters, ownParameters],
    route,
  }
}

function validateResponseStatuses(route: Route, name: string, errors: RouteResponses): void {
  for (const [key, declaration] of Object.entries(route.responses)) {
    const status = Number(key)
    const error = errors[status]
    if (error !== undefined && error !== declaration) {
      throw new TypeError(
        `Contract route "${name}" response ${status} conflicts with the contract error declared for the same status`
      )
    }
  }
}

/** @internal Validates a contract shape while producing the route metadata consumed by every runtime. */
export function compileContractRouteDefinitions(
  basePath: string,
  routes: ContractRoutes,
  errors: RouteResponses
): readonly CompiledContractRoute[] {
  const registry: RouteRegistry = {}
  const compiledRoutes: CompiledContractRoute[] = []
  const hasErrors = errors !== emptyErrors

  for (const [name, value] of Object.entries(routes)) {
    const router = isRouter(value)
    if (!isRecord(value) || (!router && value.kind !== 'route')) {
      throw new TypeError(`Contract route "${name}" must be a route or router definition`)
    }

    if (!router) {
      assertRoute(value, name)
      if (hasErrors) validateResponseStatuses(value, `routes.${name}`, errors)
      const path = joinRoutePaths(basePath, value.path)
      registerRoute(registry, `routes.${name}`, path, value)
      compiledRoutes.push(compiledRoute([name], path, [], value))
      continue
    }

    assertRouter(value, name)
    const metadata = value.$meta
    const routerParameters = compilePathParameters(metadata.path, 'params' in metadata ? metadata.params : undefined)
    const pathParameters = routerParameters === undefined ? [] : [routerParameters]
    for (const [routeName, routeValue] of routerEntries(value)) {
      const qualifiedName = `routes.${name}.${routeName}`
      assertRoute(routeValue, qualifiedName)
      if (hasErrors) validateResponseStatuses(routeValue, qualifiedName, errors)
      const path = joinRoutePaths(basePath, metadata.path, routeValue.path)
      registerRoute(registry, qualifiedName, path, routeValue)
      compiledRoutes.push(compiledRoute([name, routeName], path, pathParameters, routeValue))
    }
  }

  if (compiledRoutes.length === 0) {
    throw new TypeError('Contract must declare at least one route')
  }
  return compiledRoutes
}

function copyErrors(errors: unknown): Readonly<RouteResponses> {
  if (errors === undefined) return emptyErrors
  if (!isRecord(errors)) throw new TypeError('Contract errors must be an object')

  const copy: RouteResponses = {}

  for (const [key, declaration] of Object.entries(errors)) {
    const status = Number(key)

    if (!Number.isInteger(status) || String(status) !== key || status < 400 || status > 599) {
      throw new TypeError(`Contract error status "${key}" must be an integer between 400 and 599`)
    }

    if (!isRecord(declaration) || declaration['kind'] !== 'response') {
      throw new TypeError(`Contract error ${status} must be declared with a response helper`)
    }

    copy[status] = declaration as RouteResponses[number]
  }

  return Object.freeze(copy)
}

export function defineContract<
  const Routes extends ContractRoutes,
  const BasePath extends string = '',
  const Errors extends RouteResponses = {},
>(options: ContractOptions<BasePath, Routes, Errors>): Contract<BasePath, Routes, Errors>

export function defineContract(options: ContractOptions): Contract {
  if (!isRecord(options)) throw new TypeError('Contract options must be an object')

  const basePath = options.basePath === undefined ? '' : options.basePath
  if (typeof basePath !== 'string') throw new TypeError('Contract base path must be a string')
  assertBasePath(basePath)

  if (!isRecord(options.routes)) {
    throw new TypeError('Contract routes must be an object')
  }

  const routes = Object.freeze({ ...options.routes }) as ContractRoutes
  const errors = copyErrors(options.errors)

  const compiledRoutes = compileContractRouteDefinitions(basePath, routes, errors)
  const contract = Object.freeze({
    kind: 'contract',
    basePath,
    routes,
    errors,
  })
  getContractState(contract).routes = compiledRoutes
  return contract
}
