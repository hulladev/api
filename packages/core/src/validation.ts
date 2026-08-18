import type { StandardSchemaV1 } from '@standard-schema/spec'
import {
  annotateAPIErrorIssues,
  type APIError,
  type APIErrorIssue,
  type APIErrorLocation,
  type SchemaValidationErrorCode,
} from './errors'
import { type ExecutionStep, isPromiseLike, mapExecutionStep } from './execution'

export type AnySchema = StandardSchemaV1
export type SchemaInput<Schema extends AnySchema> = StandardSchemaV1.InferInput<Schema>
export type SchemaOutput<Schema extends AnySchema> = StandardSchemaV1.InferOutput<Schema>
export type SchemaIssue = APIErrorIssue
export type IdentitySchema<Value = unknown> = StandardSchemaV1<Value, Value>
/** Prevents an all-optional options overload from accepting a Standard Schema object. */
export type NonSchemaOptions = { readonly '~standard'?: never }

export type ObjectSchema = StandardSchemaV1<Readonly<Record<string, unknown>>, Readonly<Record<string, unknown>>>

declare const asyncSchemaType: unique symbol

export type AsyncSchema<Schema extends AnySchema = AnySchema> = Schema & {
  readonly [asyncSchemaType]: Schema
}

/** @internal A validation step that stays synchronous unless its schema actually suspends. */
export type SchemaStep<Value> = ExecutionStep<Value>

export type SchemaExecutionPlan<Schema extends AnySchema = AnySchema> = {
  readonly decode: (value: unknown) => SchemaStep<SchemaOutput<Schema>>
  readonly encode?: (value: SchemaOutput<Schema>) => SchemaStep<SchemaInput<Schema>>
}

type HullaCodecProperties<Wire, Application> = {
  readonly version: 1
  readonly encode: StandardSchemaV1<Application, Wire>
}

declare const codecSchemaType: unique symbol

export type CodecSchema<Wire, Application> = StandardSchemaV1<Wire, Application> & {
  readonly '~hulla': HullaCodecProperties<Wire, Application>
  readonly [codecSchemaType]: {
    readonly wire: Wire
    readonly application: Application
  }
}

export type CodecOptions<Wire, Application> = {
  readonly decode: (value: Wire) => SchemaStep<Application>
  readonly encode: (value: Application) => SchemaStep<Wire>
}

type IdentityCheckedSchema<Schema extends AnySchema> = [SchemaInput<Schema>] extends [SchemaOutput<Schema>]
  ? [SchemaOutput<Schema>] extends [SchemaInput<Schema>]
    ? Schema
    : never
  : never

/** The value supplied at an outbound boundary: application values for codecs, schema inputs otherwise. */
export type SchemaOutbound<Schema extends AnySchema> = Schema extends {
  readonly [codecSchemaType]: unknown
}
  ? SchemaOutput<Schema>
  : SchemaInput<Schema>

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

function codecValidation<Input, Output>(
  source: StandardSchemaV1<Input, Input>,
  target: StandardSchemaV1<Output, Output>,
  transform: (value: Input) => SchemaStep<Output>
): StandardSchemaV1<Input, Output>['~standard']['validate'] {
  return (value: unknown) => {
    const result = mapExecutionStep(source['~standard'].validate(value), (sourceResult) => {
      if (sourceResult.issues !== undefined) return sourceResult
      return mapExecutionStep(transform(sourceResult.value), (transformed) => target['~standard'].validate(transformed))
    })
    return isPromiseLike(result) ? Promise.resolve(result) : result
  }
}

/** Defines an explicitly bidirectional mapping between wire and application representations. */
export function codec<const WireSchema extends AnySchema, const ApplicationSchema extends AnySchema>(
  wireSchema: IdentityCheckedSchema<WireSchema>,
  applicationSchema: IdentityCheckedSchema<ApplicationSchema>,
  options: CodecOptions<SchemaOutput<WireSchema>, SchemaOutput<ApplicationSchema>>
): CodecSchema<SchemaOutput<WireSchema>, SchemaOutput<ApplicationSchema>> {
  if (!isSchema(wireSchema) || !isSchema(applicationSchema)) {
    throw new TypeError('Codec representations must be Standard Schemas')
  }
  if (typeof options !== 'object' || options === null) throw new TypeError('Codec options must be an object')
  if (typeof options.decode !== 'function') throw new TypeError('Codec decode must be a function')
  if (typeof options.encode !== 'function') throw new TypeError('Codec encode must be a function')

  type Wire = SchemaOutput<WireSchema>
  type Application = SchemaOutput<ApplicationSchema>
  const wire = wireSchema as StandardSchemaV1<Wire, Wire>
  const application = applicationSchema as StandardSchemaV1<Application, Application>
  const encode: StandardSchemaV1<Application, Wire> = Object.freeze({
    '~standard': Object.freeze({
      version: 1 as const,
      vendor: '@hulla/api',
      validate: codecValidation(application, wire, options.encode),
    }),
  })

  return Object.freeze({
    '~standard': Object.freeze({
      version: 1 as const,
      vendor: '@hulla/api',
      validate: codecValidation(wire, application, options.decode),
    }),
    '~hulla': Object.freeze({ version: 1 as const, encode }),
  }) as CodecSchema<Wire, Application>
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

function schemaSource<Schema extends AnySchema>(schema: Schema): AnySchema {
  return asyncSchemaSources.get(schema as object) ?? schema
}

function isHullaCodec<Wire, Application>(
  schema: StandardSchemaV1<Wire, Application>
): schema is CodecSchema<Wire, Application> {
  const properties = (schema as Partial<CodecSchema<Wire, Application>>)['~hulla']
  return isObject(properties) && properties['version'] === 1 && isSchema(properties['encode'])
}

/** @internal Validates an outbound value and resolves it to the schema's application representation. */
export function validateSchemaOutbound<const Schema extends AnySchema>(
  schema: Schema,
  value: SchemaOutbound<Schema>
): StandardSchemaV1.Result<SchemaOutput<Schema>> | PromiseLike<StandardSchemaV1.Result<SchemaOutput<Schema>>> {
  const source = schemaSource(schema) as StandardSchemaV1<SchemaInput<Schema>, SchemaOutput<Schema>>
  if (!isHullaCodec(source)) return source['~standard'].validate(value)

  return mapExecutionStep(source['~hulla'].encode['~standard'].validate(value), (encoded) =>
    encoded.issues === undefined ? source['~standard'].validate(encoded.value) : encoded
  )
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

/** @internal */
export function isSchemaStepAsync<Value>(value: SchemaStep<Value>): value is PromiseLike<Value> {
  return isPromiseLike(value)
}

/** @internal Maps a validation step without scheduling synchronous validators on the microtask queue. */
export function mapSchemaStep<Value, Result>(
  value: SchemaStep<Value>,
  transform: (value: Value) => Result
): SchemaStep<Result> {
  return mapExecutionStep(value, transform)
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

const schemaExecutionPlans = new WeakMap<object, Map<APIErrorLocation | undefined, SchemaExecutionPlan>>()

/** Compiles schema capability detection and boundary metadata once for repeated execution. */
export function compileSchemaExecution<const Schema extends AnySchema>(
  schema: Schema,
  options: SchemaValidationOptions = {}
): SchemaExecutionPlan<Schema> {
  if (!isSchema(schema)) throw new TypeError('Schema execution input must be a Standard Schema')

  let plans = schemaExecutionPlans.get(schema as object)
  if (plans === undefined) {
    plans = new Map()
    schemaExecutionPlans.set(schema as object, plans)
  }
  const cached = plans.get(options.location)
  if (cached !== undefined) return cached as unknown as SchemaExecutionPlan<Schema>

  const source = schemaSource(schema) as StandardSchemaV1<SchemaInput<Schema>, SchemaOutput<Schema>>
  const asynchronous = isAsyncSchema(schema)
  const decode = asynchronous
    ? (value: unknown) => Promise.resolve().then(() => validateWithValue(source, value, options))
    : (value: unknown) => validateWithValue(source, value, options)

  let encode: SchemaExecutionPlan<Schema>['encode']
  if (isHullaCodec(source)) {
    encode = asynchronous
      ? (value) => Promise.resolve().then(() => validateWithValue(source['~hulla'].encode, value, options))
      : (value) => validateWithValue(source['~hulla'].encode, value, options)
  }

  const plan = Object.freeze({ decode, ...(encode === undefined ? {} : { encode }) }) as SchemaExecutionPlan<Schema>
  plans.set(options.location, plan as unknown as SchemaExecutionPlan)
  return plan
}

/** @internal Validates a wire value without forcing a synchronous validator through a promise boundary. */
export function decodeSchemaValue<const Schema extends AnySchema>(
  schema: Schema,
  value: unknown,
  options?: SchemaValidationOptions
): SchemaStep<SchemaOutput<Schema>> {
  return compileSchemaExecution(schema, options).decode(value)
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
export function encodeSchema<Wire, Application>(
  schema: CodecSchema<Wire, Application>,
  value: Application,
  options?: SchemaValidationOptions
): Promise<Wire> {
  try {
    return Promise.resolve(compileSchemaExecution(schema, options).encode!(value) as Wire | PromiseLike<Wire>)
  } catch (error) {
    return Promise.reject(error)
  }
}

export const validation = /* @__PURE__ */ Object.freeze({ async: asyncSchema })
