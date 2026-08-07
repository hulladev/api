import type { StandardSchemaV1 } from '@standard-schema/spec'
import type { ObjectSchema } from './validation'

type SegmentParam<Segment extends string> = Segment extends `:${infer Param}` ? Param : never

export type ExtractPathParamNames<Path extends string> = Path extends `${infer Segment}/${infer Rest}`
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

export function assertBasePath(basePath: string): void {
  if (basePath === '' || basePath === '/') return

  if (basePath.includes('?')) {
    throw new TypeError(
      `Contract base path "${basePath}" cannot contain a query string; declare query parameters with the route "query" option instead`
    )
  }
  if (basePath.includes('#')) {
    throw new TypeError(
      `Contract base path "${basePath}" cannot contain a hash fragment; fragments are client-side only and should not be included in contract paths`
    )
  }
  if (basePath.includes('//')) {
    throw new TypeError(`Contract base path "${basePath}" cannot contain empty segments (//)`)
  }

  for (const segment of basePath.split('/').filter(Boolean)) {
    if (segment === '.' || segment === '..') {
      throw new TypeError(`Contract base path "${basePath}" contains an unsafe segment`)
    }
    if (segment.startsWith(':')) {
      throw new TypeError(`Contract base path "${basePath}" cannot contain parameters`)
    }
  }
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
