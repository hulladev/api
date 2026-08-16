import { hasOwn, isRecord } from './object'
import { bytesSchema, formDataSchema, jsonValueSchema, stringSchema, type JsonValue } from './representation'
import type { Route } from './route'
import { defineStreamResponse, type FormattedStreamResponseBody, type StreamResponseBody } from './stream'
import {
  isSchema,
  type AnySchema,
  type CodecSchema,
  type IdentitySchema,
  type NonSchemaOptions,
  type ObjectSchema,
  type SchemaOutput,
} from './validation'

export type { JsonValue } from './representation'

export type ResponseHeaders = ObjectSchema
export type ResponseBodyKind = 'bytes' | 'empty' | 'form-data' | 'json' | 'raw' | 'stream' | 'text'

export type ResponseBody<
  Kind extends ResponseBodyKind,
  Schema extends AnySchema | undefined = undefined,
  Metadata extends object | undefined = undefined,
> = [Schema] extends [undefined]
  ? [Metadata] extends [object]
    ? { readonly kind: Kind } & Metadata
    : { readonly kind: Kind }
  : [Metadata] extends [object]
    ? { readonly kind: Kind; readonly schema: Schema } & Metadata
    : { readonly kind: Kind; readonly schema: Schema }

export type AnyResponseBody =
  | ResponseBody<'bytes' | 'form-data' | 'json' | 'text', AnySchema>
  | ResponseBody<'empty' | 'raw'>
  | StreamResponseBody
  | FormattedStreamResponseBody

export type RouteResponse<
  Body extends { readonly kind: ResponseBodyKind },
  Headers extends ResponseHeaders | undefined,
  ContentType extends string | undefined,
> = {
  readonly kind: 'response'
  readonly body: Body
  readonly headers: Headers
  readonly contentType: ContentType
}

export type AnyRouteResponse = RouteResponse<AnyResponseBody, ResponseHeaders | undefined, string | undefined>

export type RouteResponses = Record<number, AnyRouteResponse>

/** The application value represented by a response body declaration. */
export type ResponseBodyValue<Body extends AnyResponseBody> = Body extends { readonly kind: 'empty' }
  ? undefined
  : Body extends { readonly kind: 'raw' }
    ? Response
    : Body extends { readonly kind: 'stream'; readonly schema: infer Schema extends AnySchema }
      ? AsyncIterable<SchemaOutput<Schema>>
      : Body extends { readonly kind: 'stream' }
        ? AsyncIterable<Uint8Array>
        : Body extends { readonly schema: infer Schema extends AnySchema }
          ? SchemaOutput<Schema>
          : never

export type RouteResponseStatus<RouteType> = RouteType extends {
  readonly responses: infer Responses extends RouteResponses
}
  ? Extract<keyof Responses, number>
  : never

type SchemaResponseBody = ResponseBody<'bytes' | 'form-data' | 'json' | 'text', AnySchema>

/** Declared response statuses whose complete body value is represented by one schema. */
export type SchemaBackedResponseStatus<RouteType> = RouteType extends {
  readonly responses: infer Responses extends RouteResponses
}
  ? {
      [Status in keyof Responses]: Responses[Status] extends AnyRouteResponse
        ? Responses[Status]['body'] extends SchemaResponseBody
          ? Status
          : never
        : never
    }[keyof Responses] &
      number
  : never

/** The exact body schema declared for one schema-backed route response. */
export type RouteResponseSchema<RouteType, Status extends SchemaBackedResponseStatus<RouteType>> = RouteType extends {
  readonly responses: infer Responses extends RouteResponses
}
  ? Status extends keyof Responses
    ? Responses[Status]['body'] extends SchemaResponseBody
      ? Responses[Status]['body']['schema']
      : never
    : never
  : never

/** Selects an ordinary response body schema without exposing its HTTP descriptor to consumers. */
export function routeOutput<const RouteType extends Route, const Status extends SchemaBackedResponseStatus<RouteType>>(
  route: RouteType,
  status: Status
): RouteResponseSchema<RouteType, Status> {
  if (!isRecord(route) || route.kind !== 'route' || !isRecord(route.responses)) {
    throw new TypeError('Response schema route must be a route')
  }
  if (!hasOwn(route.responses, status)) throw new TypeError(`Route does not declare response status ${status}`)

  const declaration = route.responses[status]
  const body = declaration?.body
  if (
    !isRecord(body) ||
    (body.kind !== 'bytes' && body.kind !== 'form-data' && body.kind !== 'json' && body.kind !== 'text') ||
    !isSchema(body.schema)
  ) {
    throw new TypeError(`Route response ${status} does not declare a complete body schema`)
  }

  return body.schema as RouteResponseSchema<RouteType, Status>
}

/** The application body value for one declared route response status. */
export type RouteResponseBody<RouteType, Status extends RouteResponseStatus<RouteType>> = RouteType extends {
  readonly responses: infer Responses extends RouteResponses
}
  ? Status extends keyof Responses
    ? ResponseBodyValue<Responses[Status]['body']>
    : never
  : never

type ResponseOptions<Headers extends ResponseHeaders | undefined, ContentType extends string> = NonSchemaOptions & {
  readonly headers?: Headers
  readonly contentType?: ContentType
}

type EmptyResponseOptions<Headers extends ResponseHeaders | undefined> = {
  readonly headers?: Headers
}

type WireSchema<Wire> = CodecSchema<Wire, unknown> | IdentitySchema<Wire>
type SchemaResponseBodyKind = Exclude<ResponseBodyKind, 'empty' | 'raw' | 'stream'>

type BodyResponseFactory<
  Kind extends SchemaResponseBodyKind,
  Wire,
  DefaultSchema extends WireSchema<Wire>,
  DefaultContentType extends string,
> = {
  <
    const Schema extends WireSchema<Wire>,
    const Headers extends ResponseHeaders | undefined = undefined,
    const ContentType extends string = DefaultContentType,
  >(
    schema: Schema,
    options?: ResponseOptions<Headers, ContentType>
  ): RouteResponse<ResponseBody<Kind, Schema>, Headers, ContentType>
  <
    const Headers extends ResponseHeaders | undefined = undefined,
    const ContentType extends string = DefaultContentType,
  >(
    options?: ResponseOptions<Headers, ContentType>
  ): RouteResponse<ResponseBody<Kind, DefaultSchema>, Headers, ContentType>
}

function defineDefaultBodyResponse<
  const Kind extends SchemaResponseBodyKind,
  Wire,
  const DefaultSchema extends WireSchema<Wire>,
  const DefaultContentType extends string,
>(
  kind: Kind,
  defaultSchema: DefaultSchema,
  defaultContentType: DefaultContentType
): BodyResponseFactory<Kind, Wire, DefaultSchema, DefaultContentType> {
  function bodyResponse<
    const Schema extends WireSchema<Wire>,
    const Headers extends ResponseHeaders | undefined = undefined,
    const ContentType extends string = DefaultContentType,
  >(
    schemaOrOptions?: Schema | ResponseOptions<Headers, ContentType>,
    explicitOptions?: ResponseOptions<Headers, ContentType>
  ): RouteResponse<ResponseBody<Kind, Schema | DefaultSchema>, Headers, ContentType> {
    const hasSchema = isSchema(schemaOrOptions)
    const schema = hasSchema ? schemaOrOptions : defaultSchema
    const options = hasSchema ? explicitOptions : schemaOrOptions

    return Object.freeze({
      kind: 'response',
      body: Object.freeze({ kind, schema }),
      headers: options?.headers as Headers,
      contentType: (options?.contentType ?? defaultContentType) as ContentType,
    })
  }

  return bodyResponse as BodyResponseFactory<Kind, Wire, DefaultSchema, DefaultContentType>
}

/** Defaults to any valid JSON value. Pass a schema for a more precise client and server contract. */
export const json = /* @__PURE__ */ defineDefaultBodyResponse<
  'json',
  JsonValue,
  typeof jsonValueSchema,
  'application/json'
>('json', jsonValueSchema, 'application/json')

export const text = /* @__PURE__ */ defineDefaultBodyResponse<
  'text',
  string,
  typeof stringSchema,
  'text/plain; charset=utf-8'
>('text', stringSchema, 'text/plain; charset=utf-8')

export const bytes = /* @__PURE__ */ defineDefaultBodyResponse<
  'bytes',
  Uint8Array,
  typeof bytesSchema,
  'application/octet-stream'
>('bytes', bytesSchema, 'application/octet-stream')

export const formData = /* @__PURE__ */ defineDefaultBodyResponse<
  'form-data',
  FormData,
  typeof formDataSchema,
  'multipart/form-data'
>('form-data', formDataSchema, 'multipart/form-data')

export const stream = defineStreamResponse()

export function raw(): RouteResponse<ResponseBody<'raw'>, undefined, undefined> {
  return Object.freeze({
    kind: 'response',
    body: Object.freeze({ kind: 'raw' }),
    headers: undefined,
    contentType: undefined,
  })
}

export function empty<const Headers extends ResponseHeaders | undefined = undefined>(
  options?: EmptyResponseOptions<Headers>
): RouteResponse<ResponseBody<'empty'>, Headers, undefined> {
  return Object.freeze({
    kind: 'response',
    body: Object.freeze({ kind: 'empty' }),
    headers: options?.headers as Headers,
    contentType: undefined,
  })
}

/** Namespace-style response factories for ergonomic route declarations. */
export const response = /* @__PURE__ */ Object.freeze({ json, text, bytes, formData, stream, raw, empty })
