import type { HttpMethod } from './http'
import type { PathParamOptions, PathParams, PathParamsFor } from './paths'
import type { RouteResponses } from './response'
import type { AnySchema, ObjectSchema } from './validation'

export type RouteQuery = ObjectSchema
export type RouteHeaders = ObjectSchema

export type RouteParams<Path extends string> = PathParams<Path>

type RouteBody = AnySchema

type RouteBodyOptions<Method extends HttpMethod, Body extends RouteBody | undefined> = Method extends 'GET'
  ? { readonly body?: never }
  : { readonly body?: Body }

export type RouteShape = {
  readonly params: ObjectSchema | undefined
  readonly query: RouteQuery | undefined
  readonly headers: RouteHeaders | undefined
  readonly body: RouteBody | undefined
  readonly responses: Readonly<RouteResponses>
}

export type RouteDefinition<
  Method extends HttpMethod = HttpMethod,
  Path extends string = string,
  Shape extends RouteShape = RouteShape,
> = {
  readonly kind: 'route'
  readonly method: Method
  readonly path: Path
  readonly params: Shape['params']
  readonly query: Shape['query']
  readonly headers: Shape['headers']
  readonly body: Shape['body']
  readonly responses: Shape['responses']
}

export type AnyRoute = RouteDefinition

export type RouteMap = Readonly<Record<string, RouteDefinition>>

export type RouteOptions<
  Method extends HttpMethod,
  Path extends string,
  Responses extends RouteResponses = RouteResponses,
  Params extends ObjectSchema | undefined = PathParamsFor<Path>,
  Query extends RouteQuery | undefined = undefined,
  Headers extends RouteHeaders | undefined = undefined,
  Body extends RouteBody | undefined = undefined,
> = {
  readonly responses: Responses
  readonly query?: Query
  readonly headers?: Headers
} & PathParamOptions<Path, Params> &
  RouteBodyOptions<Method, Body>

type DefinedRouteShape<
  Params extends ObjectSchema | undefined,
  Query extends RouteQuery | undefined,
  Headers extends RouteHeaders | undefined,
  Body extends RouteBody | undefined,
  Responses extends RouteResponses,
> = {
  readonly params: Params
  readonly query: Query
  readonly headers: Headers
  readonly body: Body
  readonly responses: Readonly<Responses>
}

function defineRoute<const Method extends HttpMethod>(method: Method) {
  return <
    const Path extends string,
    const Responses extends RouteResponses,
    const Params extends ObjectSchema | undefined = PathParamsFor<Path>,
    const Query extends RouteQuery | undefined = undefined,
    const Headers extends RouteHeaders | undefined = undefined,
    const Body extends RouteBody | undefined = undefined,
  >(
    path: Path,
    options: RouteOptions<Method, Path, Responses, Params, Query, Headers, Body>
  ): RouteDefinition<Method, Path, DefinedRouteShape<Params, Query, Headers, Body, Responses>> =>
    Object.freeze({
      kind: 'route',
      method,
      path,
      params: options.params as Params,
      query: options.query as Query,
      headers: options.headers as Headers,
      body: options.body as Body,
      responses: Object.freeze({ ...options.responses }) as Readonly<Responses>,
    })
}

export const route = Object.freeze({
  get: defineRoute('GET'),
  post: defineRoute('POST'),
  put: defineRoute('PUT'),
  delete: defineRoute('DELETE'),
  patch: defineRoute('PATCH'),
  query: defineRoute('QUERY'),
})
