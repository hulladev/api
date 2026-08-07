import { HTTP_METHODS, type HttpMethod } from './http'
import { assertBasePath, joinRoutePaths, routePathShape } from './paths'
import type { RouteResponses } from './response'
import type { Route } from './route'
import type { Router } from './router'

export type ContractRoute = Route | Router

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

function isRecord(value: unknown): value is Readonly<Record<string, unknown>> {
  return typeof value === 'object' && value !== null && !Array.isArray(value)
}

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

function assertRouter(value: unknown, name: string): asserts value is Router {
  if (
    !isRecord(value) ||
    value['kind'] !== 'router' ||
    typeof value['path'] !== 'string' ||
    !isRecord(value['routes'])
  ) {
    throw new TypeError(`Contract router "${name}" must be a router definition`)
  }
}

function registerRoute(
  routesBySignature: Map<string, RegisteredRoute>,
  name: string,
  path: string,
  route: Route
): void {
  const signature = `${route.method} ${routePathShape(path)}`
  const existing = routesBySignature.get(signature)

  if (existing) {
    throw new TypeError(
      `Contract contains conflicting routes "${existing.name}" (${existing.method} ${existing.path}) and "${name}" (${route.method} ${path})`
    )
  }

  routesBySignature.set(signature, { name, method: route.method, path })
}

function validateContract(basePath: string, routes: ContractRoutes): void {
  const routesBySignature = new Map<string, RegisteredRoute>()
  let routeCount = 0

  for (const [name, value] of Object.entries(routes)) {
    if (!isRecord(value) || (value['kind'] !== 'route' && value['kind'] !== 'router')) {
      throw new TypeError(`Contract route "${name}" must be a route or router definition`)
    }

    if (value['kind'] === 'route') {
      assertRoute(value, name)
      registerRoute(routesBySignature, `routes.${name}`, joinRoutePaths(basePath, value.path), value)
      routeCount += 1
      continue
    }

    assertRouter(value, name)
    for (const [routeName, routeValue] of Object.entries(value.routes)) {
      const qualifiedName = `routes.${name}.routes.${routeName}`
      assertRoute(routeValue, qualifiedName)
      registerRoute(routesBySignature, qualifiedName, joinRoutePaths(basePath, value.path, routeValue.path), routeValue)
      routeCount += 1
    }
  }

  if (routeCount === 0) {
    throw new TypeError('Contract must declare at least one route')
  }
}

function copyErrors(errors: unknown): Readonly<RouteResponses> {
  if (errors === undefined) return Object.freeze({})
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

  validateContract(basePath, routes)

  return Object.freeze({
    kind: 'contract',
    basePath,
    routes,
    errors,
  })
}
