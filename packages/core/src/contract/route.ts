import { isSchema, type AnySchema, type ObjectSchema, type SchemaInput } from '../validation'
import { assertRoutePath, type PathParamOptions, type PathParams, type PathParamsFor } from './paths'
import type { JsonValue } from './representation'
import {
  isRequestBodyDefinition,
  json as jsonRequest,
  type AnyRequestBody,
  type QueryWireObject,
  type RequestBodyDefinition,
  type TextWireObject,
} from './request'
import type { RouteResponses } from './response'

export const HTTP_METHODS = ['GET', 'POST', 'PUT', 'DELETE', 'PATCH', 'QUERY'] as const

export type HttpMethod = (typeof HTTP_METHODS)[number]

export type RouteQuery = ObjectSchema
export type RouteHeaders = ObjectSchema

export type RouteParams<Path extends string> = PathParams<Path>

type RouteQueryInput = ObjectSchema
type RouteBodyInput = AnySchema | AnyRequestBody

type RouteBodyOptions<Method extends HttpMethod, Body extends RouteBodyInput | undefined> = Method extends 'GET'
  ? { readonly body?: never }
  : { readonly body?: CheckedBody<Body> }

type CheckedQuery<Declaration> = Declaration extends RouteQueryInput
  ? SchemaInput<Declaration> extends QueryWireObject
    ? Declaration
    : never
  : never

type CheckedHeaders<Schema> = Schema extends RouteHeaders
  ? SchemaInput<Schema> extends TextWireObject
    ? Schema
    : never
  : never

type CheckedBody<Body> = Body extends AnyRequestBody
  ? Body
  : Body extends AnySchema
    ? SchemaInput<Body> extends JsonValue
      ? Body
      : never
    : Body

type NormalizedBody<Body> = Body extends AnyRequestBody
  ? Body
  : Body extends AnySchema
    ? RequestBodyDefinition<'json', Body, 'application/json'>
    : undefined

export type RouteShape = {
  readonly params: ObjectSchema | undefined
  readonly query: ObjectSchema | undefined
  readonly headers: RouteHeaders | undefined
  readonly body: AnyRequestBody | undefined
  readonly responses: Readonly<RouteResponses>
}

type DefinedField<Name extends PropertyKey, Value> = [Value] extends [undefined]
  ? object
  : undefined extends Value
    ? { readonly [Key in Name]?: Exclude<Value, undefined> }
    : { readonly [Key in Name]: Value }

export type Route<
  Method extends HttpMethod = HttpMethod,
  Path extends string = string,
  Shape extends RouteShape = RouteShape,
> = {
  readonly kind: 'route'
  readonly method: Method
  readonly path: Path
  readonly responses: Shape['responses']
} & DefinedField<'params', Shape['params']> &
  DefinedField<'query', Shape['query']> &
  DefinedField<'headers', Shape['headers']> &
  DefinedField<'body', Shape['body']>

export type RouteMap = Readonly<Record<string, Route>>

export type RouteOptions<
  Method extends HttpMethod,
  Path extends string,
  Responses extends RouteResponses = RouteResponses,
  Params extends ObjectSchema | undefined = PathParamsFor<Path>,
  Query extends RouteQueryInput | undefined = undefined,
  Headers extends RouteHeaders | undefined = undefined,
  Body extends RouteBodyInput | undefined = undefined,
> = {
  readonly responses: Responses
  readonly query?: CheckedQuery<Query>
  readonly headers?: CheckedHeaders<Headers>
} & PathParamOptions<Path, Params> &
  RouteBodyOptions<Method, Body>

type DefinedRouteShape<
  Params extends ObjectSchema | undefined,
  Query extends ObjectSchema | undefined,
  Headers extends RouteHeaders | undefined,
  Body extends AnyRequestBody | undefined,
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
    const Query extends RouteQueryInput | undefined = undefined,
    const Headers extends RouteHeaders | undefined = undefined,
    const Body extends RouteBodyInput | undefined = undefined,
  >(
    path: Path,
    options: RouteOptions<Method, Path, Responses, Params, Query, Headers, Body>
  ): NoInfer<Route<Method, Path, DefinedRouteShape<Params, Query, Headers, NormalizedBody<Body>, Responses>>> => {
    assertRoutePath(path, `${method} route path`)
    if (typeof options !== 'object' || options === null || Array.isArray(options)) {
      throw new TypeError(`${method} route options must be an object`)
    }
    if (options.query !== undefined && !isSchema(options.query)) {
      throw new TypeError('Request query must be declared with an object Standard Schema')
    }
    const query = options.query
    const body =
      options.body === undefined
        ? undefined
        : isRequestBodyDefinition(options.body)
          ? options.body
          : (jsonRequest as (schema: AnySchema) => AnyRequestBody)(options.body as AnySchema)

    return Object.freeze({
      kind: 'route',
      method,
      path,
      ...(options.params === undefined ? {} : { params: options.params as Params }),
      ...(query === undefined ? {} : { query: query as Query }),
      ...(options.headers === undefined ? {} : { headers: options.headers as Headers }),
      ...(body === undefined ? {} : { body: body as NormalizedBody<Body> }),
      responses: Object.freeze({ ...options.responses }) as Readonly<Responses>,
    }) as Route<Method, Path, DefinedRouteShape<Params, Query, Headers, NormalizedBody<Body>, Responses>>
  }
}

export const route = {
  get: defineRoute('GET'),
  post: defineRoute('POST'),
  put: defineRoute('PUT'),
  delete: defineRoute('DELETE'),
  patch: defineRoute('PATCH'),
  query: defineRoute('QUERY'),
} as const
