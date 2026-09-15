import type { CompiledContractRoute, CompiledPathParameters } from '../compiler'
import { freezeCompiledRoutes } from '../compiler'
import { isErrorDeclaration, type AnyErrorDeclaration, type NormalizedErrorStatusMap } from '../declared-errors'
import { isRecord, setOwn } from '../object'
import type { ObjectSchema } from '../validation'
import { assertBasePath, joinRoutePaths, pathParamNames, routePathShape } from './paths'
import { HTTP_METHODS, type HttpMethod, type Route } from './route'
import { isRouter, routerRoutes, type AnyRouter } from './router'
import type { ContractSelection } from './types'
import type { Contract, ContractOptions, ContractRoute, ContractRoutes } from './types'

type RegisteredRoute = {
  readonly name: string
  readonly method: HttpMethod
  readonly path: string
}

type RouteRegistry = {
  routes: Map<string, RegisteredRoute>
}

const emptyErrors = Object.freeze({}) as Readonly<NormalizedErrorStatusMap>

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
  const routes = registry.routes
  const signature = `${route.method} ${routePathShape(path)}`
  const existing = routes.get(signature)

  if (existing) {
    throw new TypeError(
      `Contract contains conflicting routes "${existing.name}" (${existing.method} ${existing.path}) and "${name}" (${route.method} ${path})`
    )
  }

  routes.set(signature, registered)
}

function compilePathParameters(
  path: string,
  schema: ObjectSchema | undefined,
  names: readonly string[]
): CompiledPathParameters | undefined {
  if (names.length === 0) return undefined
  if (schema === undefined) throw new TypeError(`Contract route path "${path}" is missing a parameter schema`)
  return { path, names, schema }
}

function compiledRoute(
  key: readonly string[],
  path: string,
  pathParameters: readonly CompiledPathParameters[],
  route: Route,
  ownNames: readonly string[]
): CompiledContractRoute {
  const ownParameters = compilePathParameters(route.path, 'params' in route ? route.params : undefined, ownNames)
  return {
    key: Object.freeze([...key]),
    method: route.method,
    path,
    pathParameters: ownParameters === undefined ? [...pathParameters] : [...pathParameters, ownParameters],
    route,
  }
}

/** @internal Validates a contract shape while producing the route metadata consumed by every runtime. */
function compileContractRouteDefinitions(
  basePath: string,
  routes: ContractRoutes,
  errors: NormalizedErrorStatusMap
): readonly CompiledContractRoute[] {
  const registry: RouteRegistry = { routes: new Map() }
  const compiledRoutes: CompiledContractRoute[] = []
  const seen = new Set<object>()

  const visit = (
    definitions: ContractRoutes,
    keyPrefix: readonly string[],
    pathPrefix: readonly string[],
    pathParameters: readonly CompiledPathParameters[],
    parameterNames: ReadonlySet<string>
  ): void => {
    for (const [name, value] of Object.entries(definitions)) {
      const nestedRouter = isRouter(value)
      if (!isRecord(value) || (!nestedRouter && value.kind !== 'route')) {
        throw new TypeError(`Contract route "${[...keyPrefix, name].join('.')}" must be a route or router definition`)
      }
      const qualifiedKey = [...keyPrefix, name]
      const qualifiedName = `routes.${qualifiedKey.join('.')}`

      const ownPath = nestedRouter ? value.$meta.path : value.path
      const ownNames = pathParamNames(ownPath)
      const conflicts = ownNames.filter((parameter) => parameterNames.has(parameter))
      if (conflicts.length > 0) {
        throw new TypeError(
          `Contract declaration "${qualifiedName}" redeclares ${conflicts.length === 1 ? 'parameter' : 'parameters'} ${conflicts.map((parameter) => `"${parameter}"`).join(', ')}`
        )
      }

      if (!nestedRouter) {
        assertRoute(value, qualifiedKey.join('.'))
        for (const status of Object.keys(value.responses)) {
          if (errors[Number(status)] !== undefined) {
            throw new TypeError(
              `Contract route "${qualifiedName}" response ${status} conflicts with a declared error status`
            )
          }
        }
        const path = joinRoutePaths(...pathPrefix, value.path)
        registerRoute(registry, qualifiedName, path, value)
        compiledRoutes.push(compiledRoute(qualifiedKey, path, pathParameters, value, ownNames))
        continue
      }

      assertRouter(value, qualifiedKey.join('.'))
      if (seen.has(value)) throw new TypeError(`Cyclic contract router "${qualifiedName}"`)
      seen.add(value)
      const metadata = value.$meta
      const routerParameters = compilePathParameters(
        metadata.path,
        'params' in metadata ? metadata.params : undefined,
        ownNames
      )
      // Only routers extend the inherited scope. Leaf routes have no descendants.
      const nextNames = ownNames.length === 0 ? parameterNames : new Set([...parameterNames, ...ownNames])
      visit(
        routerRoutes(value),
        qualifiedKey,
        [...pathPrefix, metadata.path],
        routerParameters === undefined ? pathParameters : [...pathParameters, routerParameters],
        nextNames
      )
      seen.delete(value)
    }
  }

  visit(routes, [], [basePath], [], new Set())

  if (compiledRoutes.length === 0) {
    throw new TypeError('Contract must declare at least one route')
  }
  return compiledRoutes
}

function copyErrors(errors: unknown): Readonly<NormalizedErrorStatusMap> {
  if (errors === undefined) return emptyErrors
  if (!isRecord(errors)) throw new TypeError('Contract errors must be an object')

  const copy: Record<number, readonly AnyErrorDeclaration[]> = {}
  const codes = new Set<string>()
  const declarations = new Set<object>()

  for (const [key, declaration] of Object.entries(errors)) {
    const status = Number(key)

    if (!Number.isInteger(status) || String(status) !== key || status < 400 || status > 599) {
      throw new TypeError(`Contract error status "${key}" must be an integer between 400 and 599`)
    }

    const values = Array.isArray(declaration) ? declaration : [declaration]
    if (values.length === 0) throw new TypeError(`Contract error ${status} must not be an empty array`)
    const declared = values.map((value, index) => {
      if (!isErrorDeclaration(value)) {
        throw new TypeError(`Contract error ${status} at index ${index} must be declared with defineErrors`)
      }
      if (codes.has(value.code)) throw new TypeError(`Contract error code "${value.code}" is declared more than once`)
      if (declarations.has(value)) {
        throw new TypeError(`Contract error ${value.code} cannot be assigned to more than one status`)
      }
      codes.add(value.code)
      declarations.add(value)
      return value
    })
    copy[status] = Object.freeze(declared)
  }

  return Object.freeze(copy)
}

function selectRoutes(
  definitions: ContractRoutes,
  manifest: readonly CompiledContractRoute[],
  errors: NormalizedErrorStatusMap
): ContractRoutes {
  let cursor = 0
  const visit = (definitions: ContractRoutes, prefix: readonly string[]): ContractRoutes => {
    const selected: Record<string, ContractRoute> = {}
    for (const [name, declaration] of Object.entries(definitions)) {
      if (name === '$contract') throw new TypeError('Contract route name "$contract" is reserved for metadata')
      const start = cursor
      const nested = isRouter(declaration)
      const key = nested ? Object.freeze([...prefix, name]) : manifest[cursor]!.key
      const node = nested ? { ...visit(routerRoutes(declaration), key), $meta: declaration.$meta } : { ...declaration }
      if (!nested) cursor++
      // The manifest and tree share declaration order, so every subtree is a contiguous slice.
      const metadata: ContractSelection = Object.freeze({
        key,
        routes: Object.freeze(manifest.slice(start, cursor)),
        errors,
      })
      Object.defineProperty(node, '$contract', { value: metadata, enumerable: false })
      if (nested) Object.defineProperty(node, '$meta', { value: declaration.$meta, enumerable: false })
      setOwn(selected, name, Object.freeze(node) as ContractRoute)
    }
    return Object.freeze(selected)
  }
  return visit(definitions, [])
}

export function createContract(options: ContractOptions): Contract {
  if (!isRecord(options)) throw new TypeError('Contract options must be an object')

  const basePath = options.basePath === undefined ? '' : options.basePath
  if (typeof basePath !== 'string') throw new TypeError('Contract base path must be a string')
  assertBasePath(basePath)

  if (!isRecord(options.routes)) {
    throw new TypeError('Contract routes must be an object')
  }

  const errors = copyErrors(options.errors)

  const compiledRoutes = freezeCompiledRoutes(compileContractRouteDefinitions(basePath, options.routes, errors))
  const routes = selectRoutes(options.routes, compiledRoutes, errors)
  return Object.freeze({
    basePath,
    routes,
    errors,
    $contract: Object.freeze({ key: Object.freeze([]), routes: compiledRoutes, errors }),
  }) as unknown as Contract
}
