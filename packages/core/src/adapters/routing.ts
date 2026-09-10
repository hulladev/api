import type { CompiledContractRoute } from '../compiler'
import { setOwn } from '../object'
import { ServerRuntimeError } from '../server/errors'

type RoutableRoute = {
  readonly compiled: CompiledContractRoute
  readonly pattern: readonly string[]
}

type RoutingNode<Route extends RoutableRoute> = {
  parameter?: RoutingNode<Route>
  readonly routes: Route[]
  readonly static: Map<string, RoutingNode<Route>>
}

export type RoutingTable<Route extends RoutableRoute> = {
  readonly root: RoutingNode<Route>
}

type RouteMatch<Route extends RoutableRoute> = {
  readonly runtime: Route
  readonly parameters: Readonly<Record<string, string>>
}

export type RouteSelection<Route extends RoutableRoute> = RouteMatch<Route> | { readonly allowed: readonly string[] }

export const emptyParameters = {}

function pathSegments(path: string): readonly string[] {
  if (path === '' || path === '/') return []
  return path.startsWith('/') ? path.slice(1).split('/') : path.split('/')
}

function decodePathname(pathname: string, encoded: boolean): readonly string[] {
  const segments = pathSegments(pathname)
  if (!encoded) return segments
  try {
    return segments.map((segment) => decodeURIComponent(segment))
  } catch (cause) {
    throw new ServerRuntimeError('invalid-path-encoding', 400, 'Request path contains invalid percent encoding', {
      cause,
      location: 'params',
    })
  }
}

function routingNode<Route extends RoutableRoute>(): RoutingNode<Route> {
  return { routes: [], static: new Map() }
}

function matchingNode<Route extends RoutableRoute>(
  node: RoutingNode<Route>,
  segments: readonly string[],
  index: number
): RoutingNode<Route> | undefined {
  if (index === segments.length) return node.routes.length === 0 ? undefined : node

  const segment = segments[index]!
  const staticNode = node.static.get(segment)
  const match = staticNode === undefined ? undefined : matchingNode(staticNode, segments, index + 1)
  return match ?? (node.parameter === undefined ? undefined : matchingNode(node.parameter, segments, index + 1))
}

function captureParameters<Route extends RoutableRoute>(
  runtime: Route,
  segments: readonly string[]
): Readonly<Record<string, string>> {
  if (runtime.compiled.pathParameters.length === 0) return emptyParameters

  const parameters: Record<string, string> = {}
  for (let index = 0; index < runtime.pattern.length; index++) {
    const expected = runtime.pattern[index]!
    if (expected.startsWith(':')) setOwn(parameters, expected.slice(1), segments[index]!)
  }
  return parameters
}

function compileTree<Route extends RoutableRoute>(routes: readonly Route[]): RoutingNode<Route> {
  const root = routingNode<Route>()
  for (const runtime of routes) {
    let node = root
    for (const segment of runtime.pattern) {
      if (segment.startsWith(':')) {
        node.parameter ??= routingNode()
        node = node.parameter
        continue
      }

      let child = node.static.get(segment)
      if (child === undefined) {
        child = routingNode()
        node.static.set(segment, child)
      }
      node = child
    }
    node.routes.push(runtime)
  }
  return root
}

function selectCandidates<Route extends RoutableRoute>(
  candidates: readonly Route[],
  method: string,
  segments?: readonly string[]
): RouteSelection<Route> {
  for (const runtime of candidates) {
    if (runtime.compiled.method === method) {
      return {
        runtime,
        parameters: segments === undefined ? emptyParameters : captureParameters(runtime, segments),
      }
    }
  }
  return { allowed: [...new Set(candidates.map((runtime) => runtime.compiled.method))] }
}

export function compileRoutingTable<Route extends RoutableRoute>(routes: readonly Route[]): RoutingTable<Route> {
  return { root: compileTree(routes) }
}

export function selectRoute<Route extends RoutableRoute>(
  table: RoutingTable<Route>,
  pathname: string,
  method: string
): RouteSelection<Route> {
  const segments = decodePathname(pathname, pathname.includes('%'))
  const node = matchingNode(table.root, segments, 0)
  return node === undefined ? { allowed: [] } : selectCandidates(node.routes, method, segments)
}
