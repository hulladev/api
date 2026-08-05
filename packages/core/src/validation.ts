import type { StandardSchemaV1 } from '@standard-schema/spec'

export type AnySchema = StandardSchemaV1
export type SchemaInput<Schema extends AnySchema> = StandardSchemaV1.InferInput<Schema>
export type SchemaOutput<Schema extends AnySchema> = StandardSchemaV1.InferOutput<Schema>
export type SchemaIssue = StandardSchemaV1.Issue

export type ObjectSchema = StandardSchemaV1<Readonly<Record<string, unknown>>, Readonly<Record<string, unknown>>>

type SafeEncodeResult<Value> =
  | { readonly success: true; readonly data: Value }
  | {
      readonly success: false
      readonly error: { readonly issues: ReadonlyArray<SchemaIssue> }
    }

type NativeReversibleSchema<Wire, Application> = StandardSchemaV1<Wire, Application> & {
  readonly safeEncodeAsync: (value: Application) => Promise<SafeEncodeResult<Wire>>
}

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

export class SchemaValidationError extends TypeError {
  readonly issues: ReadonlyArray<SchemaIssue>

  constructor(issues: ReadonlyArray<SchemaIssue>) {
    super(issues[0]?.message ?? 'Schema validation failed')
    this.name = 'SchemaValidationError'
    this.issues = issues
  }
}

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

function isNativeReversibleSchema<Wire, Application>(
  schema: StandardSchemaV1<Wire, Application>
): schema is NativeReversibleSchema<Wire, Application> {
  return typeof (schema as Partial<NativeReversibleSchema<Wire, Application>>).safeEncodeAsync === 'function'
}

async function validateWith<Output>(schema: StandardSchemaV1<unknown, Output>, value: unknown): Promise<Output> {
  const result = await schema['~standard'].validate(value)
  if (result.issues !== undefined) throw new SchemaValidationError(result.issues)
  return result.value
}

/** Validates and transforms a wire value into its application representation. */
export function decodeSchema<const Schema extends AnySchema>(
  schema: Schema,
  value: unknown
): Promise<SchemaOutput<Schema>> {
  return validateWith(schema, value)
}

/** Validates and transforms an application value into its wire representation. */
export async function encodeSchema<const Schema extends AnySchema>(
  schema: Schema,
  value: SchemaOutput<Schema>
): Promise<SchemaInput<Schema>> {
  if (isHullaCodec(schema)) return validateWith(schema['~hulla'].encode, value)

  if (isNativeReversibleSchema(schema)) {
    const result = await schema.safeEncodeAsync(value)
    if (!result.success) throw new SchemaValidationError(result.error.issues)
    return result.data
  }

  // Standard Schema only specifies the forward direction. A schema without an
  // explicit encoder is treated as an identity validator for equivalent types.
  return validateWith(schema as StandardSchemaV1<unknown, SchemaInput<Schema>>, value)
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
