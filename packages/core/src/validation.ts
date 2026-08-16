import type { StandardSchemaV1 } from '@standard-schema/spec'
import {
  annotateAPIErrorIssues,
  type APIError,
  type APIErrorIssue,
  type APIErrorLocation,
  type SchemaValidationErrorCode,
} from './errors'

export type AnySchema = StandardSchemaV1
export type SchemaInput<Schema extends AnySchema> = StandardSchemaV1.InferInput<Schema>
export type SchemaOutput<Schema extends AnySchema> = StandardSchemaV1.InferOutput<Schema>
export type SchemaIssue = APIErrorIssue

export type ObjectSchema = StandardSchemaV1<Readonly<Record<string, unknown>>, Readonly<Record<string, unknown>>>

type SafeEncodeResult<Value> =
  | { readonly success: true; readonly data: Value }
  | {
      readonly success: false
      readonly error: { readonly issues: ReadonlyArray<SchemaIssue> }
    }

type NativeSyncReversibleSchema<Wire, Application> = StandardSchemaV1<Wire, Application> & {
  readonly safeEncode: (value: Application) => SafeEncodeResult<Wire>
}

type NativeReversibleSchema<Wire, Application> = StandardSchemaV1<Wire, Application> & {
  readonly safeEncodeAsync: (value: Application) => Promise<SafeEncodeResult<Wire>>
}

declare const asyncSchemaType: unique symbol

export type AsyncSchema<Schema extends AnySchema = AnySchema> = StandardSchemaV1<
  SchemaInput<Schema>,
  SchemaOutput<Schema>
> & {
  readonly [asyncSchemaType]: Schema
}

/** @internal A validation step that stays synchronous unless its schema actually suspends. */
export type SchemaStep<Value> = PromiseLike<Value> | Value

type HullaCodecProperties<Wire, Application> = {
  readonly version: 1
  readonly encode: StandardSchemaV1<Application, Wire>
}

export type CodecSchema<Wire, Application> = StandardSchemaV1<Wire, Application> & {
  readonly '~hulla': HullaCodecProperties<Wire, Application>
}

export type CodecOptions<Wire, Application> = {
  readonly decode: StandardSchemaV1<Wire, Application>
  readonly encode: StandardSchemaV1<Application, Wire>
}

export type SchemaDefinition<Value> = {
  readonly name: string
  readonly message?: string
  readonly check: (value: unknown) => value is Value
}

export type SchemaValidationOptions = {
  readonly location?: APIErrorLocation
}

export class SchemaValidationError extends TypeError implements APIError<SchemaValidationErrorCode, SchemaIssue> {
  readonly code = 'schema-validation'
  readonly issues: readonly SchemaIssue[]
  readonly location?: APIErrorLocation

  constructor(issues: readonly SchemaIssue[], options: SchemaValidationOptions & ErrorOptions = {}) {
    const annotated = annotateAPIErrorIssues(issues, {
      code: 'schema-validation',
      ...(options.location === undefined ? {} : { location: options.location }),
    })
    super(annotated[0]?.message ?? 'Schema validation failed', options)
    this.name = 'SchemaValidationError'
    this.issues = annotated
    if (options.location !== undefined) this.location = options.location
  }
}

const asyncSchemaSources = new WeakMap<object, AnySchema>()

function isObject(value: unknown): value is Record<PropertyKey, unknown> {
  return typeof value === 'object' && value !== null
}

export function isSchema(value: unknown): value is AnySchema {
  if (!isObject(value)) return false

  const standard = value['~standard']
  return (
    isObject(standard) &&
    standard['version'] === 1 &&
    typeof standard['vendor'] === 'string' &&
    typeof standard['validate'] === 'function'
  )
}

function isHullaCodec<Wire, Application>(
  schema: StandardSchemaV1<Wire, Application>
): schema is CodecSchema<Wire, Application> {
  const properties = (schema as Partial<CodecSchema<Wire, Application>>)['~hulla']
  return isObject(properties) && properties['version'] === 1 && isSchema(properties['encode'])
}

function schemaSource<Schema extends AnySchema>(schema: Schema): AnySchema {
  return asyncSchemaSources.get(schema as object) ?? schema
}

export function isAsyncSchema(schema: AnySchema): schema is AsyncSchema {
  return asyncSchemaSources.has(schema as object)
}

/** Marks a Standard Schema as intentionally asynchronous without mutating the validator-owned object. */
export function asyncSchema<const Schema extends AnySchema>(schema: Schema): AsyncSchema<Schema> {
  if (!isSchema(schema)) throw new TypeError('Async validation input must be a Standard Schema')
  if (isAsyncSchema(schema)) return schema as unknown as AsyncSchema<Schema>

  const wrapper = Object.freeze({ '~standard': schema['~standard'] }) as AsyncSchema<Schema>
  asyncSchemaSources.set(wrapper, schema)
  return wrapper
}

function isNativeReversibleSchema<Wire, Application>(
  schema: StandardSchemaV1<Wire, Application>
): schema is NativeReversibleSchema<Wire, Application> {
  return typeof (schema as Partial<NativeReversibleSchema<Wire, Application>>).safeEncodeAsync === 'function'
}

function isNativeSyncReversibleSchema<Wire, Application>(
  schema: StandardSchemaV1<Wire, Application>
): schema is NativeSyncReversibleSchema<Wire, Application> {
  return typeof (schema as Partial<NativeSyncReversibleSchema<Wire, Application>>).safeEncode === 'function'
}

/** @internal */
export function isSchemaStepAsync<Value>(value: SchemaStep<Value>): value is PromiseLike<Value> {
  return (
    (typeof value === 'object' || typeof value === 'function') &&
    value !== null &&
    typeof (value as PromiseLike<Value>).then === 'function'
  )
}

/** @internal Maps a validation step without scheduling synchronous validators on the microtask queue. */
export function mapSchemaStep<Value, Result>(
  value: SchemaStep<Value>,
  transform: (value: Value) => Result
): SchemaStep<Result> {
  return isSchemaStepAsync(value) ? Promise.resolve(value).then(transform) : transform(value)
}

function validationValue<Output>(result: StandardSchemaV1.Result<Output>, options?: SchemaValidationOptions): Output {
  if (result.issues !== undefined) throw new SchemaValidationError(result.issues, options)
  return result.value
}

function validateWithValue<Output>(
  schema: StandardSchemaV1<unknown, Output>,
  value: unknown,
  options?: SchemaValidationOptions
): SchemaStep<Output> {
  const result = schema['~standard'].validate(value)
  return isSchemaStepAsync(result)
    ? Promise.resolve(result).then((resolved) => validationValue(resolved, options))
    : validationValue(result, options)
}

function encodedValue<Wire>(result: SafeEncodeResult<Wire>, options?: SchemaValidationOptions): Wire {
  if (!result.success) throw new SchemaValidationError(result.error.issues, options)
  return result.data
}

/** @internal Validates a wire value without forcing a synchronous validator through a promise boundary. */
export function decodeSchemaValue<const Schema extends AnySchema>(
  schema: Schema,
  value: unknown,
  options?: SchemaValidationOptions
): SchemaStep<SchemaOutput<Schema>> {
  if (isAsyncSchema(schema)) {
    return Promise.resolve().then(() => validateWithValue(schemaSource(schema), value, options)) as Promise<
      SchemaOutput<Schema>
    >
  }
  return validateWithValue(schema, value, options) as SchemaStep<SchemaOutput<Schema>>
}

/** @internal Encodes an application value while preserving a validator's actual execution mode. */
export function encodeSchemaValue<const Schema extends AnySchema>(
  schema: Schema,
  value: SchemaOutput<Schema>,
  options?: SchemaValidationOptions
): SchemaStep<SchemaInput<Schema>> {
  const source = schemaSource(schema) as StandardSchemaV1<SchemaInput<Schema>, SchemaOutput<Schema>>
  const asynchronous = isAsyncSchema(schema)
  if (isHullaCodec(source)) {
    return asynchronous
      ? Promise.resolve().then(() => validateWithValue(source['~hulla'].encode, value, options))
      : validateWithValue(source['~hulla'].encode, value, options)
  }

  if (!asynchronous && isNativeSyncReversibleSchema(source)) {
    return encodedValue(source.safeEncode(value), options)
  }

  if (isNativeReversibleSchema(source)) {
    return source.safeEncodeAsync(value).then((result) => encodedValue(result, options))
  }

  // Standard Schema only specifies the forward direction. A schema without an
  // explicit encoder is treated as an identity validator for equivalent types.
  const validate = () =>
    validateWithValue(source as StandardSchemaV1<unknown, SchemaInput<Schema>>, value, options) as SchemaStep<
      SchemaInput<Schema>
    >
  return asynchronous ? Promise.resolve().then(validate) : validate()
}

/** Validates and transforms a wire value into its application representation. */
export function decodeSchema<const Schema extends AnySchema>(
  schema: Schema,
  value: unknown,
  options?: SchemaValidationOptions
): Promise<SchemaOutput<Schema>> {
  try {
    return Promise.resolve(decodeSchemaValue(schema, value, options))
  } catch (error) {
    return Promise.reject(error)
  }
}

/** Validates and transforms an application value into its wire representation. */
export function encodeSchema<const Schema extends AnySchema>(
  schema: Schema,
  value: SchemaOutput<Schema>,
  options?: SchemaValidationOptions
): Promise<SchemaInput<Schema>> {
  try {
    return Promise.resolve(encodeSchemaValue(schema, value, options))
  } catch (error) {
    return Promise.reject(error)
  }
}

/** Combines two Standard Schemas into one bidirectional contract schema. */
export function codec<const Wire, const Application>(
  options: CodecOptions<Wire, Application>
): CodecSchema<Wire, Application> {
  return Object.freeze({
    '~standard': options.decode['~standard'],
    '~hulla': Object.freeze({
      version: 1 as const,
      encode: options.encode,
    }),
  })
}

/** Creates a dependency-free identity schema for a value checked by a predicate. */
export function defineSchema<const Value>(definition: SchemaDefinition<Value>): CodecSchema<Value, Value> {
  const schema: StandardSchemaV1<Value, Value> = Object.freeze({
    '~standard': Object.freeze({
      version: 1 as const,
      vendor: 'hulla',
      validate: (value: unknown): StandardSchemaV1.Result<Value> =>
        definition.check(value)
          ? { value }
          : {
              issues: [
                {
                  message: definition.message ?? `Expected ${definition.name}`,
                },
              ],
            },
    }),
  })

  return codec({ decode: schema, encode: schema })
}

export const validation = /* @__PURE__ */ Object.freeze({ async: asyncSchema })
