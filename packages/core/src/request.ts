import type { StandardSchemaV1 } from '@standard-schema/spec'
import { bytesSchema, formDataSchema, jsonValueSchema, stringSchema, type JsonValue } from './representation'
import {
  decodeSchema,
  decodeSchemaValue,
  encodeSchema,
  encodeSchemaValue,
  isSchema,
  mapSchemaStep,
  type AnySchema,
  type CodecSchema,
  type IdentitySchema,
  type NonSchemaOptions,
  type ObjectSchema,
  type SchemaInput,
  type SchemaStep,
} from './validation'

export type QueryWireValue = string | readonly string[] | undefined
export type QueryWireObject = Readonly<Record<string, QueryWireValue>>
export type TextWireObject = Readonly<Record<string, string | undefined>>

/** Narrows an encoded header-like value to the string wire object used by HTTP. */
export function textWireObject(value: unknown, name: string): TextWireObject {
  if (typeof value !== 'object' || value === null || Array.isArray(value)) {
    throw new TypeError(`Encoded ${name} must be an object`)
  }

  for (const [key, field] of Object.entries(value)) {
    if (field !== undefined && typeof field !== 'string') {
      throw new TypeError(`Encoded ${name} field "${key}" must be a string or undefined`)
    }
  }

  return value as TextWireObject
}

export type RequestBodyKind = 'bytes' | 'form-data' | 'json' | 'text'

const REQUEST_BODY_KINDS = new Set<RequestBodyKind>(['bytes', 'form-data', 'json', 'text'])

export type RequestBodyDefinition<
  Kind extends RequestBodyKind = RequestBodyKind,
  Schema extends AnySchema = AnySchema,
  ContentType extends string = string,
> = {
  readonly kind: 'request-body'
  readonly representation: Kind
  readonly schema: Schema
  readonly contentType: ContentType
}

export type AnyRequestBody = RequestBodyDefinition<RequestBodyKind, AnySchema, string>

export type RequestQueryDefinition<
  Schema extends ObjectSchema = ObjectSchema,
  Repeated extends readonly string[] = readonly string[],
> = {
  readonly kind: 'request-query'
  readonly schema: Schema
  readonly repeated: Repeated
}

export type AnyRequestQuery = RequestQueryDefinition<ObjectSchema, readonly string[]>

type Defined<Value> = Exclude<Value, undefined>

type RepeatedPart<Value> = Extract<Defined<Value>, readonly string[]>
type SingularPart<Value> = Exclude<Defined<Value>, readonly string[]>

export type RepeatedQueryKeys<Schema extends AnySchema> =
  SchemaInput<Schema> extends infer Input extends object
    ? {
        [Key in keyof Input]-?: [RepeatedPart<Input[Key]>] extends [never]
          ? never
          : [SingularPart<Input[Key]>] extends [never]
            ? Key
            : never
      }[keyof Input] &
        string
    : never

export type AnyRepeatedQueryKeys<Schema extends AnySchema> =
  SchemaInput<Schema> extends infer Input extends object
    ? {
        [Key in keyof Input]-?: [RepeatedPart<Input[Key]>] extends [never] ? never : Key
      }[keyof Input] &
        string
    : never

type AmbiguousQueryKeys<Schema extends AnySchema> = Exclude<AnyRepeatedQueryKeys<Schema>, RepeatedQueryKeys<Schema>>

type MissingRepeatedKeys<Schema extends AnySchema, Repeated extends readonly string[]> = Exclude<
  RepeatedQueryKeys<Schema>,
  Repeated[number]
>

type CompleteRepeatedKeys<Schema extends AnySchema, Repeated extends readonly string[]> = [
  MissingRepeatedKeys<Schema, Repeated>,
] extends [never]
  ? object
  : {
      readonly 'repeated must include every array or tuple query key': MissingRepeatedKeys<Schema, Repeated>
    }

type UnambiguousRepeatedKeys<Schema extends AnySchema> = [AmbiguousQueryKeys<Schema>] extends [never]
  ? object
  : {
      readonly 'query fields cannot mix scalar and repeated inputs': AmbiguousQueryKeys<Schema>
    }

type RequestBodyOptions<ContentType extends string> = NonSchemaOptions & {
  readonly contentType?: ContentType
}

type WireSchema<Wire> = CodecSchema<Wire, unknown> | IdentitySchema<Wire>

type RequestBodyFactory<
  Kind extends RequestBodyKind,
  Wire,
  DefaultSchema extends WireSchema<Wire>,
  DefaultContentType extends string,
> = {
  <const Schema extends WireSchema<Wire>, const ContentType extends string = DefaultContentType>(
    schema: Schema,
    options?: RequestBodyOptions<ContentType>
  ): RequestBodyDefinition<Kind, Schema, ContentType>
  <const ContentType extends string = DefaultContentType>(
    options?: RequestBodyOptions<ContentType>
  ): RequestBodyDefinition<Kind, DefaultSchema, ContentType>
}

function defineRequestBodyFactory<
  const Kind extends RequestBodyKind,
  Wire,
  const DefaultSchema extends WireSchema<Wire>,
  const DefaultContentType extends string,
>(
  representation: Kind,
  defaultSchema: DefaultSchema,
  defaultContentType: DefaultContentType
): RequestBodyFactory<Kind, Wire, DefaultSchema, DefaultContentType> {
  function requestBody<const Schema extends WireSchema<Wire>, const ContentType extends string = DefaultContentType>(
    schemaOrOptions?: Schema | RequestBodyOptions<ContentType>,
    explicitOptions?: RequestBodyOptions<ContentType>
  ): RequestBodyDefinition<Kind, Schema | DefaultSchema, ContentType> {
    const hasSchema = isSchema(schemaOrOptions)
    const schema = hasSchema ? schemaOrOptions : defaultSchema
    const options = hasSchema ? explicitOptions : schemaOrOptions

    return Object.freeze({
      kind: 'request-body',
      representation,
      schema,
      contentType: (options?.contentType ?? defaultContentType) as ContentType,
    })
  }

  return requestBody as RequestBodyFactory<Kind, Wire, DefaultSchema, DefaultContentType>
}

export const json = /* @__PURE__ */ defineRequestBodyFactory<
  'json',
  JsonValue,
  typeof jsonValueSchema,
  'application/json'
>('json', jsonValueSchema, 'application/json')

export const text = /* @__PURE__ */ defineRequestBodyFactory<'text', string, typeof stringSchema, 'text/plain'>(
  'text',
  stringSchema,
  'text/plain'
)

export const bytes = /* @__PURE__ */ defineRequestBodyFactory<
  'bytes',
  Uint8Array,
  typeof bytesSchema,
  'application/octet-stream'
>('bytes', bytesSchema, 'application/octet-stream')

export const formData = /* @__PURE__ */ defineRequestBodyFactory<
  'form-data',
  FormData,
  typeof formDataSchema,
  'multipart/form-data'
>('form-data', formDataSchema, 'multipart/form-data')

export function query<const Schema extends ObjectSchema, const Repeated extends readonly RepeatedQueryKeys<Schema>[]>(
  schema: Schema,
  options: { readonly repeated: Repeated } & CompleteRepeatedKeys<Schema, Repeated> & UnambiguousRepeatedKeys<Schema>
): RequestQueryDefinition<Schema, Repeated> {
  if (!isSchema(schema)) throw new TypeError('Request query schema must be a Standard Schema')
  if (typeof options !== 'object' || options === null || !Array.isArray(options.repeated)) {
    throw new TypeError('Request query repeated keys must be an array')
  }

  const repeated = new Set<string>()
  for (const key of options.repeated) {
    if (typeof key !== 'string' || key.length === 0) {
      throw new TypeError('Request query repeated keys must be non-empty strings')
    }
    if (repeated.has(key)) throw new TypeError(`Request query repeated key "${key}" is declared more than once`)
    repeated.add(key)
  }

  return Object.freeze({
    kind: 'request-query',
    schema,
    repeated: Object.freeze([...options.repeated]) as unknown as Repeated,
  })
}

export function isRequestBodyDefinition(value: unknown): value is AnyRequestBody {
  const declaration = value as Partial<AnyRequestBody>
  return (
    typeof value === 'object' &&
    value !== null &&
    declaration.kind === 'request-body' &&
    declaration.representation !== undefined &&
    REQUEST_BODY_KINDS.has(declaration.representation) &&
    typeof declaration.contentType === 'string' &&
    isSchema(declaration.schema)
  )
}

export function isRequestQueryDefinition(value: unknown): value is AnyRequestQuery {
  return (
    typeof value === 'object' &&
    value !== null &&
    (value as Partial<AnyRequestQuery>).kind === 'request-query' &&
    isSchema((value as Partial<AnyRequestQuery>).schema) &&
    Array.isArray((value as Partial<AnyRequestQuery>).repeated)
  )
}

export function mimeEssence(contentType: string): string {
  const separator = contentType.indexOf(';')
  return contentType
    .slice(0, separator === -1 ? contentType.length : separator)
    .trim()
    .toLowerCase()
}

export function matchesContentType(declaration: AnyRequestBody, contentType: string): boolean {
  return mimeEssence(declaration.contentType) === mimeEssence(contentType)
}

export async function decodeRequestBody<const Declaration extends AnyRequestBody>(
  declaration: Declaration,
  value: unknown,
  contentType: string
): Promise<StandardSchemaV1.InferOutput<Declaration['schema']>> {
  if (!matchesContentType(declaration, contentType)) {
    throw new TypeError(
      `Expected request content type ${mimeEssence(declaration.contentType)}, received ${mimeEssence(contentType) || 'none'}`
    )
  }

  return decodeSchema(declaration.schema, value, { location: 'body' })
}

/** @internal Decodes a request body while preserving synchronous schema execution. */
export function decodeRequestBodyValue<const Declaration extends AnyRequestBody>(
  declaration: Declaration,
  value: unknown,
  contentType: string
): SchemaStep<StandardSchemaV1.InferOutput<Declaration['schema']>> {
  if (!matchesContentType(declaration, contentType)) {
    throw new TypeError(
      `Expected request content type ${mimeEssence(declaration.contentType)}, received ${mimeEssence(contentType) || 'none'}`
    )
  }

  return decodeSchemaValue(declaration.schema, value, { location: 'body' })
}

export async function encodeRequestBody<const Declaration extends AnyRequestBody>(
  declaration: Declaration,
  value: StandardSchemaV1.InferOutput<Declaration['schema']>
): Promise<{
  readonly body: StandardSchemaV1.InferInput<Declaration['schema']>
  readonly contentType: Declaration['contentType']
}> {
  return {
    body: await encodeSchema(declaration.schema, value, { location: 'body' }),
    contentType: declaration.contentType,
  }
}

/** @internal Encodes a request body while preserving synchronous schema execution. */
export function encodeRequestBodyValue<const Declaration extends AnyRequestBody>(
  declaration: Declaration,
  value: StandardSchemaV1.InferOutput<Declaration['schema']>
): SchemaStep<{
  readonly body: StandardSchemaV1.InferInput<Declaration['schema']>
  readonly contentType: Declaration['contentType']
}> {
  return mapSchemaStep(encodeSchemaValue(declaration.schema, value, { location: 'body' }), (body) => ({
    body,
    contentType: declaration.contentType,
  }))
}

export const request = /* @__PURE__ */ Object.freeze({ query, json, text, bytes, formData })
