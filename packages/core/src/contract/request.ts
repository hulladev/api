import { isSchema, type AnySchema, type IdentitySchema, type NonSchemaOptions, type SchemaInput } from '../validation'
import { bytesSchema, formDataSchema, jsonValueSchema, stringSchema, type JsonValue } from './representation'

type QueryWireValue = string | readonly string[] | undefined
export type QueryWireObject = Readonly<Record<string, QueryWireValue>>
export type TextWireObject = Readonly<Record<string, string | undefined>>

export type TextWireEntries = readonly (readonly [string, string | undefined])[]

/** Snapshots and validates text fields once, before asynchronous request stages can mutate their source. */
export function textWireEntries(value: unknown, name: string): TextWireEntries {
  if (typeof value !== 'object' || value === null || Array.isArray(value)) {
    throw new TypeError(`Encoded ${name} must be an object`)
  }
  const entries = Object.entries(value)
  for (const [key, field] of entries) {
    if (field !== undefined && typeof field !== 'string') {
      throw new TypeError(`${name} field "${key}" must be a string or undefined`)
    }
  }
  return entries as TextWireEntries
}

/** Serializes a header-like input object into the string values used by HTTP. */
export function textWireObject(value: unknown, name: string): TextWireObject {
  return Object.fromEntries(textWireEntries(value, name))
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

type RequestBodyOptions<ContentType extends string> = NonSchemaOptions & {
  readonly contentType?: ContentType
}

type CheckedWireSchema<Schema extends AnySchema, Wire> = SchemaInput<Schema> extends Wire ? Schema : never

type RequestBodyFactory<Kind extends RequestBodyKind, Wire, DefaultContentType extends string> = {
  <const Schema extends AnySchema, const ContentType extends string = DefaultContentType>(
    schema: CheckedWireSchema<Schema, Wire>,
    options?: RequestBodyOptions<ContentType>
  ): RequestBodyDefinition<Kind, Schema, ContentType>
  <const Value extends Wire = Wire, const ContentType extends string = DefaultContentType>(
    options?: RequestBodyOptions<ContentType>
  ): RequestBodyDefinition<Kind, IdentitySchema<Value>, ContentType>
}

function defineRequestBodyFactory<
  const Kind extends RequestBodyKind,
  Wire,
  const DefaultSchema extends AnySchema,
  const DefaultContentType extends string,
>(
  representation: Kind,
  defaultSchema: DefaultSchema,
  defaultContentType: DefaultContentType
): RequestBodyFactory<Kind, Wire, DefaultContentType> {
  function requestBody<const Schema extends AnySchema, const ContentType extends string = DefaultContentType>(
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

  return requestBody as RequestBodyFactory<Kind, Wire, DefaultContentType>
}

export const json = /* @__PURE__ */ defineRequestBodyFactory<
  'json',
  JsonValue,
  typeof jsonValueSchema,
  'application/json'
>('json', jsonValueSchema, 'application/json')

const text = /* @__PURE__ */ defineRequestBodyFactory<'text', string, typeof stringSchema, 'text/plain'>(
  'text',
  stringSchema,
  'text/plain'
)

const bytes = /* @__PURE__ */ defineRequestBodyFactory<
  'bytes',
  Uint8Array,
  typeof bytesSchema,
  'application/octet-stream'
>('bytes', bytesSchema, 'application/octet-stream')

const formData = /* @__PURE__ */ defineRequestBodyFactory<
  'form-data',
  FormData,
  typeof formDataSchema,
  'multipart/form-data'
>('form-data', formDataSchema, 'multipart/form-data')

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

export function mimeEssence(contentType: string): string {
  const separator = contentType.indexOf(';')
  return contentType
    .slice(0, separator === -1 ? contentType.length : separator)
    .trim()
    .toLowerCase()
}

export const request = { json, text, bytes, formData } as const
