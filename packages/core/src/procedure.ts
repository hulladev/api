import type { Awaitable } from './context'
import { type EitherIsAsync, type ValueIsAsync } from './execution'
import {
  assertMiddleware,
  assertMiddlewares,
  dispatchMiddlewareSteps,
  type MiddlewareNext,
  type MiddlewareOptions,
} from './middleware'
import { isPlainRecord, isRecord, setOwn } from './object'
import {
  compileSchemaExecution,
  isAsyncSchema,
  isSchema,
  isSchemaStepAsync,
  mapSchemaStep,
  type AnySchema,
  type AsyncSchema,
  type SchemaInput,
  type SchemaOutput,
  type SchemaStep,
  type SchemaValidationOptions,
} from './validation'

type EmptyProcedureContext = Record<string, never>
const emptyProcedureContext = {} as EmptyProcedureContext

type DefinedField<Name extends PropertyKey, Value> = [Value] extends [undefined]
  ? object
  : { readonly [Key in Name]: Value }

export type ProcedureInputValue<Schema extends AnySchema> = SchemaInput<Schema>

export type ProcedureOutputValue<Schema extends AnySchema> = SchemaOutput<Schema>
export type ProcedureHandlerInputValue<Schema extends AnySchema> = SchemaOutput<Schema>
export type ProcedureHandlerOutputValue<Schema extends AnySchema> = SchemaInput<Schema>

export type ProcedureMetadata<Key extends readonly string[] = readonly string[]> = {
  readonly kind: 'procedure'
  readonly key: Key
}

export type ProcedureContextInput = {
  readonly input: unknown
  readonly procedure: ProcedureMetadata
}

export type ProcedureContextFactory<Context extends object> = (input: ProcedureContextInput) => Awaitable<Context>

export type DefineProceduresOptions<Context extends object> = {
  readonly context?: ProcedureContextFactory<Context>
}

type SchemaIsAsync<Schema extends AnySchema> = Schema extends AsyncSchema ? true : false
type ProcedureReturn<Result, Async extends boolean> = Async extends true ? Promise<Awaited<Result>> : Result

export type ProcedureMiddlewareInput<Context extends object, Input = unknown> = {
  readonly context: Readonly<Context>
  readonly input: Input
  readonly procedure: ProcedureMetadata
}

export type ProcedureMiddlewareNext<Result> = MiddlewareNext<Result>

export type ProcedureMiddlewareOptions<Context extends object, Input = unknown, Result = unknown> = MiddlewareOptions<
  ProcedureMiddlewareInput<Context, Input>,
  Result
>

export type ProcedureMiddleware<Context extends object, Input = unknown> = <Result>(
  options: ProcedureMiddlewareOptions<Context, Input, Result>
) => Result | PromiseLike<Result>

export type ProcedureHandlerInput<Context extends object, Input extends AnySchema | undefined> = {
  readonly context: Readonly<Context>
  readonly procedure: ProcedureMetadata
} & DefinedField<'input', Input extends AnySchema ? ProcedureHandlerInputValue<Input> : undefined>

type ProcedureCallArguments<Input extends AnySchema | undefined> = Input extends AnySchema
  ? readonly [input: ProcedureInputValue<Input>]
  : readonly []

export type Procedure<
  Input extends AnySchema | undefined = AnySchema | undefined,
  Result = unknown,
  Async extends boolean = false,
> = (...args: ProcedureCallArguments<Input>) => ProcedureReturn<Result, Async>

export type AnyProcedure = (...args: never[]) => unknown

export type BoundProcedure<
  ProcedureType extends AnyProcedure = AnyProcedure,
  Key extends readonly string[] = readonly string[],
> = ProcedureType & {
  readonly $meta: Readonly<ProcedureMetadata<Key>>
}

export type ProcedureTree = {
  readonly [key: string]: AnyProcedure | ProcedureTree
}

export type BuiltProcedureTree<Tree extends ProcedureTree, Prefix extends readonly string[] = readonly []> = Readonly<{
  [Key in keyof Tree]: Tree[Key] extends AnyProcedure
    ? BoundProcedure<Tree[Key], readonly [...Prefix, Extract<Key, string>]>
    : Tree[Key] extends ProcedureTree
      ? BuiltProcedureTree<Tree[Key], readonly [...Prefix, Extract<Key, string>]>
      : never
}>

type ProcedureExecution = (args: readonly unknown[], metadata: ProcedureMetadata) => unknown

type ProcedureRuntime = {
  readonly execute: ProcedureExecution
  readonly owner: object
}

const procedureRuntimes = new WeakMap<AnyProcedure, ProcedureRuntime>()

type MiddlewareValue<Input extends AnySchema | undefined> = Input extends AnySchema
  ? ProcedureHandlerInputValue<Input>
  : unknown

type MiddlewareIsAsync<Middleware> = Middleware extends (...args: never[]) => infer Result
  ? ValueIsAsync<Result>
  : false

type AnyMiddlewareIsAsync<Middlewares extends readonly unknown[]> =
  true extends MiddlewareIsAsync<Middlewares[number]> ? true : false

export type ProcedureBuilder<
  Context extends object = EmptyProcedureContext,
  Input extends AnySchema | undefined = undefined,
  Output extends AnySchema | undefined = undefined,
  Async extends boolean = false,
> = {
  readonly input: <const Schema extends AnySchema>(
    schema: Schema
  ) => ProcedureBuilder<Context, Schema, Output, EitherIsAsync<Async, SchemaIsAsync<Schema>>>
  readonly output: <const Schema extends AnySchema>(
    schema: Schema
  ) => ProcedureBuilder<Context, Input, Schema, EitherIsAsync<Async, SchemaIsAsync<Schema>>>
  readonly handler: [Output] extends [undefined]
    ? <const Handler extends (args: ProcedureHandlerInput<Context, Input>) => unknown>(
        handler: Handler
      ) => Procedure<Input, Awaited<ReturnType<Handler>>, EitherIsAsync<Async, ValueIsAsync<ReturnType<Handler>>>>
    : Output extends AnySchema
      ? <
          const Handler extends (
            args: ProcedureHandlerInput<Context, Input>
          ) => Awaitable<ProcedureHandlerOutputValue<Output>>,
        >(
          handler: Handler
        ) => Procedure<Input, ProcedureOutputValue<Output>, EitherIsAsync<Async, ValueIsAsync<ReturnType<Handler>>>>
      : never
  readonly middleware: <const Middleware extends ProcedureMiddleware<NoInfer<Context>, MiddlewareValue<Input>>>(
    middleware: Middleware
  ) => Middleware
  readonly use: <const Middlewares extends readonly ProcedureMiddleware<NoInfer<Context>, MiddlewareValue<Input>>[]>(
    ...middlewares: Middlewares
  ) => ProcedureBuilder<Context, Input, Output, EitherIsAsync<Async, AnyMiddlewareIsAsync<Middlewares>>>
  readonly build: <const Tree extends ProcedureTree>(tree: Tree) => BuiltProcedureTree<Tree>
}

function validateApplicationSchema(
  schema: AnySchema,
  value: unknown,
  options: SchemaValidationOptions
): SchemaStep<unknown> {
  const validation = compileSchemaExecution(schema, options).decode(value)
  if (isSchemaStepAsync(validation) && !isAsyncSchema(schema)) {
    void Promise.resolve(validation).catch(() => undefined)
    throw new TypeError('Asynchronous Standard Schemas must be wrapped with validation.async(schema)')
  }
  return validation
}

function registerProcedure(procedure: AnyProcedure, runtime: ProcedureRuntime, metadata?: ProcedureMetadata): void {
  procedureRuntimes.set(procedure, runtime)
  if (metadata !== undefined) Object.defineProperty(procedure, '$meta', { value: metadata })
}

function bindProcedure(procedure: AnyProcedure, owner: object, key: readonly string[]): BoundProcedure<AnyProcedure> {
  const runtime = procedureRuntimes.get(procedure)
  if (runtime === undefined) {
    throw new TypeError(`Procedure tree member "${key.join('.')}" must be a procedure or nested object`)
  }
  if (runtime.owner !== owner) {
    throw new TypeError(`Procedure "${key.join('.')}" belongs to a different procedure definition`)
  }

  const metadata = Object.freeze({ kind: 'procedure' as const, key: Object.freeze([...key]) })
  const callable = ((...args: readonly unknown[]) => runtime.execute(args, metadata)) as unknown as AnyProcedure
  registerProcedure(callable, runtime, metadata)
  return Object.freeze(callable) as unknown as BoundProcedure<AnyProcedure>
}

function buildProcedureTree(
  tree: ProcedureTree,
  owner: object,
  prefix: readonly string[],
  trees: Map<object, string>,
  procedures: Map<AnyProcedure, string>
): Readonly<Record<string, unknown>> {
  if (!isPlainRecord(tree)) throw new TypeError('Procedure tree must be a plain object')

  const location = prefix.join('.') || '<root>'
  const existingTree = trees.get(tree)
  if (existingTree !== undefined) {
    throw new TypeError(`Procedure tree "${location}" is already registered at "${existingTree}"`)
  }
  trees.set(tree, location)

  const result: Record<string, unknown> = {}
  for (const key of Reflect.ownKeys(tree)) {
    if (typeof key !== 'string') throw new TypeError(`Procedure tree "${location}" cannot contain symbol keys`)
    if (!Object.prototype.propertyIsEnumerable.call(tree, key)) {
      throw new TypeError(`Procedure tree "${location}" cannot contain non-enumerable members`)
    }

    const value = tree[key]
    const childKey = [...prefix, key]
    const childLocation = childKey.join('.')
    if (typeof value === 'function') {
      const executable = value as AnyProcedure
      if (!procedureRuntimes.has(executable)) {
        throw new TypeError(`Procedure tree member "${childLocation}" must be a procedure or nested object`)
      }

      const firstLocation = procedures.get(value as AnyProcedure)
      if (firstLocation !== undefined) {
        throw new TypeError(
          `Procedure "${childLocation}" is already registered at "${firstLocation}"; each procedure needs one structural identity`
        )
      }
      procedures.set(value as AnyProcedure, childLocation)
      setOwn(result, key, bindProcedure(executable, owner, childKey))
      continue
    }

    if (!isPlainRecord(value)) {
      throw new TypeError(`Procedure tree member "${childLocation}" must be a procedure or nested object`)
    }
    setOwn(result, key, buildProcedureTree(value as ProcedureTree, owner, childKey, trees, procedures))
  }

  return Object.freeze(result)
}

function createBuilder<
  Context extends object,
  Input extends AnySchema | undefined = undefined,
  Output extends AnySchema | undefined = undefined,
  Async extends boolean = false,
>(
  owner: object,
  contextFactory: ProcedureContextFactory<Context> | undefined,
  middlewares: readonly ProcedureMiddleware<Context>[],
  inputSchema?: Input,
  outputSchema?: Output
): ProcedureBuilder<Context, Input, Output, Async> {
  const middlewareStack = [...middlewares]

  const input = (<const Schema extends AnySchema>(schema: Schema) => {
    if (!isSchema(schema)) throw new TypeError('Procedure input must be a Standard Schema')
    return createBuilder(owner, contextFactory, middlewareStack, schema, outputSchema)
  }) as ProcedureBuilder<Context, Input, Output, Async>['input']

  const output = (<const Schema extends AnySchema>(schema: Schema) => {
    if (!isSchema(schema)) throw new TypeError('Procedure output must be a Standard Schema')
    return createBuilder(owner, contextFactory, middlewareStack, inputSchema, schema)
  }) as ProcedureBuilder<Context, Input, Output, Async>['output']

  const middleware = (<const Middleware extends ProcedureMiddleware<Context>>(handler: Middleware) => {
    assertMiddleware('Procedure', handler)
    return handler
  }) as ProcedureBuilder<Context, Input, Output, Async>['middleware']

  const use = (<const Middlewares extends readonly ProcedureMiddleware<Context>[]>(...applied: Middlewares) => {
    assertMiddlewares('Procedure', applied)
    return createBuilder(owner, contextFactory, [...middlewareStack, ...applied], inputSchema, outputSchema)
  }) as ProcedureBuilder<Context, Input, Output, Async>['use']

  const handler = ((implementation: (args: ProcedureHandlerInput<Context, Input>) => Awaitable<unknown>) => {
    if (typeof implementation !== 'function') throw new TypeError('Procedure handler must be a function')

    const execute: ProcedureExecution = (args, metadata) => {
      const hasInput = inputSchema !== undefined
      const inputValue = hasInput ? args[0] : undefined
      const inputStep =
        inputSchema === undefined
          ? inputValue
          : validateApplicationSchema(inputSchema, inputValue, { location: 'input' })

      return mapSchemaStep(inputStep, (decodedInput) => {
        const contextStep =
          contextFactory === undefined
            ? (emptyProcedureContext as Context)
            : contextFactory({ input: decodedInput, procedure: metadata })

        return mapSchemaStep(contextStep, (context) => {
          if (!isRecord(context)) throw new TypeError('Procedure context factory must return an object')

          const middlewareInput = { context, input: decodedInput, procedure: metadata }
          const handlerInput = {
            context,
            procedure: metadata,
            ...(hasInput ? { input: decodedInput } : {}),
          } as ProcedureHandlerInput<Context, Input>

          const result =
            middlewareStack.length === 0
              ? implementation(handlerInput)
              : dispatchMiddlewareSteps(middlewareStack, middlewareInput, () => implementation(handlerInput), {
                  invalidMiddleware: () => new TypeError('Procedure middleware must be a function'),
                  multipleNext: () => new TypeError('Procedure middleware called next() more than once'),
                })
          return outputSchema === undefined
            ? result
            : mapSchemaStep(result, (resolved) =>
                validateApplicationSchema(outputSchema, resolved, { location: 'output' })
              )
        })
      })
    }

    const metadata = Object.freeze({ kind: 'procedure' as const, key: Object.freeze([]) })
    const callable = ((...args: readonly unknown[]) => execute(args, metadata)) as unknown as AnyProcedure
    registerProcedure(callable, { execute, owner })
    return Object.freeze(callable)
  }) as unknown as ProcedureBuilder<Context, Input, Output, Async>['handler']

  const build = (<const Tree extends ProcedureTree>(tree: Tree): BuiltProcedureTree<Tree> => {
    return buildProcedureTree(tree, owner, [], new Map(), new Map()) as BuiltProcedureTree<Tree>
  }) as ProcedureBuilder<Context, Input, Output, Async>['build']

  return Object.freeze({ input, output, handler, middleware, use, build })
}

export function defineProcedures(options?: {}): ProcedureBuilder<EmptyProcedureContext>
export function defineProcedures<
  const Factory extends (input: ProcedureContextInput) => object | PromiseLike<object>,
>(options: {
  readonly context: Factory
}): ProcedureBuilder<Awaited<ReturnType<Factory>>, undefined, undefined, ValueIsAsync<ReturnType<Factory>>>
export function defineProcedures(
  options: DefineProceduresOptions<object> = {}
): ProcedureBuilder<object, undefined, undefined, boolean> {
  if (!isRecord(options)) throw new TypeError('Procedure options must be an object')
  if (options.context !== undefined && typeof options.context !== 'function') {
    throw new TypeError('Procedure context must be a function')
  }
  return createBuilder<object, undefined, undefined, boolean>({}, options.context, [])
}
