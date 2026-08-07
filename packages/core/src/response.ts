import type { StandardSchemaV1 } from '@standard-schema/spec'
import { bytesSchema, formDataSchema, jsonValueSchema, stringSchema, type JsonValue } from './representation'
import { defineStreamResponse, type FormattedStreamResponseBody, type StreamResponseBody } from './stream'
import { isSchema, type AnySchema, type ObjectSchema } from './validation'

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

type AnyResponseBody =
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

type ResponseOptions<Headers extends ResponseHeaders | undefined, ContentType extends string> = {
  readonly headers?: Headers
  readonly contentType?: ContentType
}

type EmptyResponseOptions<Headers extends ResponseHeaders | undefined> = {
  readonly headers?: Headers
}

type WireSchema<Wire> = StandardSchemaV1<Wire, unknown>
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
