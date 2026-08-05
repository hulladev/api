import { HTTP_METHODS, type HttpMethod } from './http'
import { assertBasePath, joinRoutePaths, routePathShape } from './paths'
import type { RouteDefinition } from './route'
import type { RouterDefinition } from './router'

export type ContractRoute = RouteDefinition | RouterDefinition

export type ContractRoutes = Readonly<Record<string, ContractRoute>>

export type Contract<BasePath extends string = string, Routes extends ContractRoutes = ContractRoutes> = {
  readonly kind: 'contract'
  readonly basePath: BasePath
  readonly routes: Readonly<Routes>
}

export type ContractOptions<BasePath extends string = string, Routes extends ContractRoutes = ContractRoutes> = {
  readonly basePath?: BasePath
  readonly routes: Routes
}

type RegisteredRoute = {
  readonly name: string
  readonly method: HttpMethod
  readonly path: string
}

function isRecord(value: unknown): value is Readonly<Record<string, unknown>> {
  return typeof value === 'object' && value !== null && !Array.isArray(value)
}

function assertRoute(value: unknown, name: string): asserts value is RouteDefinition {
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

function assertRouter(value: unknown, name: string): asserts value is RouterDefinition {
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
  route: RouteDefinition
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

export function defineContract<const Routes extends ContractRoutes, const BasePath extends string = ''>(
  options: ContractOptions<BasePath, Routes>
): Contract<BasePath, Routes>

export function defineContract(options: ContractOptions): Contract {
  if (!isRecord(options)) throw new TypeError('Contract options must be an object')

  const basePath = options.basePath === undefined ? '' : options.basePath
  if (typeof basePath !== 'string') throw new TypeError('Contract base path must be a string')
  assertBasePath(basePath)

  if (!isRecord(options.routes)) {
    throw new TypeError('Contract routes must be an object')
  }

  const routes = Object.freeze({ ...options.routes }) as ContractRoutes

  validateContract(basePath, routes)

  return Object.freeze({
    kind: 'contract',
    basePath,
    routes,
  })
}
