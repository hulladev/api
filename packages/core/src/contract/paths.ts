import type { StandardSchemaV1 } from '@standard-schema/spec'
import type { ObjectSchema } from '../validation'

type SegmentParam<Segment extends string> = Segment extends `:${infer Param}` ? Param : never

type ExtractPathParamNames<Path extends string> = Path extends `${infer Segment}/${infer Rest}`
  ? SegmentParam<Segment> | ExtractPathParamNames<Rest>
  : SegmentParam<Path>

type PathParamRecord<Path extends string> = {
  readonly [Param in ExtractPathParamNames<Path>]: string
}

export type PathParams<Path extends string> = StandardSchemaV1<
  PathParamRecord<Path>,
  Readonly<Record<string, unknown>> & { readonly [Param in ExtractPathParamNames<Path>]: unknown }
>

export type PathParamsFor<Path extends string> = [ExtractPathParamNames<Path>] extends [never]
  ? undefined
  : PathParams<Path>

export type PathParamOptions<Path extends string, Params extends ObjectSchema | undefined> = [
  ExtractPathParamNames<Path>,
] extends [never]
  ? { readonly params?: never }
  : { readonly params: Params & PathParams<Path> }

type TrimLeadingSlashes<Path extends string> = Path extends `/${infer Rest}` ? TrimLeadingSlashes<Rest> : Path

type TrimTrailingSlashes<Path extends string> = Path extends `${infer Rest}/` ? TrimTrailingSlashes<Rest> : Path

type TrimSlashes<Path extends string> = TrimTrailingSlashes<TrimLeadingSlashes<Path>>

type AppendRoutePath<Joined extends string, Part extends string> =
  TrimSlashes<Part> extends infer Segment extends string
    ? Segment extends ''
      ? Joined
      : Joined extends ''
        ? Segment
        : `${Joined}/${Segment}`
    : never

type JoinedRoutePath<Parts extends readonly string[], Joined extends string = ''> = Parts extends readonly [
  infer Part extends string,
  ...infer Rest extends readonly string[],
]
  ? JoinedRoutePath<Rest, AppendRoutePath<Joined, Part>>
  : Joined extends ''
    ? '/'
    : `/${Joined}`

export type JoinRoutePaths<Parts extends readonly string[]> = string extends Parts[number]
  ? string
  : JoinedRoutePath<Parts>

export function pathParamNames(path: string): readonly string[] {
  return path
    .split('/')
    .filter((segment) => segment.startsWith(':'))
    .map((segment) => segment.slice(1))
}

function assertSafePath(path: string, label: string, allowParameters: boolean): void {
  if (path.includes('?')) {
    throw new TypeError(`${label} "${path}" cannot contain a query string; use the route query option`)
  }
  if (path.includes('#')) {
    throw new TypeError(`${label} "${path}" cannot contain a hash fragment`)
  }
  if (path.includes('//')) {
    throw new TypeError(`${label} "${path}" cannot contain empty segments (//)`)
  }
  if (path.includes('\\')) {
    throw new TypeError(`${label} "${path}" cannot contain backslashes`)
  }

  let parameterNames: Set<string> | undefined
  for (const segment of path.split('/').filter(Boolean)) {
    if (segment === '.' || segment === '..') throw new TypeError(`${label} "${path}" contains an unsafe segment`)
    if (!segment.startsWith(':')) continue
    if (!allowParameters) throw new TypeError(`${label} "${path}" cannot contain parameters`)

    const name = segment.slice(1)
    if (name.length === 0) throw new TypeError(`${label} "${path}" contains an empty parameter name`)
    if (parameterNames?.has(name)) {
      throw new TypeError(`${label} "${path}" declares parameter "${name}" more than once`)
    }
    ;(parameterNames ??= new Set()).add(name)
  }
}

export function assertBasePath(basePath: string): void {
  if (basePath === '' || basePath === '/') return
  assertSafePath(basePath, 'Contract base path', false)
}

export function assertRoutePath(path: string, label: string): void {
  if (typeof path !== 'string') throw new TypeError(`${label} must be a string`)
  assertSafePath(path, label, true)
}

export function conflictingPathParamNames(...paths: readonly string[]): readonly string[] {
  const seen = new Set<string>()
  const conflicts = new Set<string>()

  for (const path of paths) {
    for (const name of pathParamNames(path)) {
      if (seen.has(name)) conflicts.add(name)
      else seen.add(name)
    }
  }

  return [...conflicts]
}

export function joinRoutePaths(...parts: readonly string[]): string {
  const joined = parts
    .filter(Boolean)
    .map((part) => part.replace(/^\/+|\/+$/g, ''))
    .filter(Boolean)
    .join('/')

  return joined ? `/${joined}` : '/'
}

export function routePathShape(path: string): string {
  return path
    .split('/')
    .filter(Boolean)
    .map((segment) => (segment.startsWith(':') ? ':' : segment))
    .join('/')
}
