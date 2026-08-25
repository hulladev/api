import type { Awaitable } from './context'
import { type EitherIsAsync, type ValueIsAsync } from './execution'
import {
  assertMiddleware,
  assertMiddlewares,
  dispatchMiddlewareSteps,
  type MiddlewareNext,
  type MiddlewareOptions,
} from './middleware'
import { isRecord } from './object'
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

export type ProcedureContextInput = {
  readonly input: unknown
}

export type ProcedureContextFactory<Context extends object> = (input: ProcedureContextInput) => Awaitable<Context>

export type DefineProcedureOptions<Context extends object> = {
  readonly context?: ProcedureContextFactory<Context>
}

type SchemaIsAsync<Schema extends AnySchema> = Schema extends AsyncSchema ? true : false
type ProcedureReturn<Result, Async extends boolean> = Async extends true ? Promise<Awaited<Result>> : Result

export type ProcedureMiddlewareInput<Context extends object, Input = unknown> = {
  readonly context: Readonly<Context>
  readonly input: Input
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
} & DefinedField<'input', Input extends AnySchema ? ProcedureHandlerInputValue<Input> : undefined>

type ProcedureCallArguments<Input extends AnySchema | undefined> = Input extends AnySchema
  ? readonly [input: ProcedureInputValue<Input>]
  : readonly []

export type Procedure<
  Input extends AnySchema | undefined = AnySchema | undefined,
  Result = unknown,
  Async extends boolean = false,
> = (...args: ProcedureCallArguments<Input>) => ProcedureReturn<Result, Async>

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
}

function compileApplicationSchemaValidation(
  schema: AnySchema,
  options: SchemaValidationOptions
): (value: unknown) => SchemaStep<unknown> {
  const decode = compileSchemaExecution(schema, options).decode
  const asynchronous = isAsyncSchema(schema)
  return (value) => {
    const validation = decode(value)
    if (isSchemaStepAsync(validation) && !asynchronous) {
      void Promise.resolve(validation).catch(() => undefined)
      throw new TypeError('Async schemas require validation.async(schema)')
    }
    return validation
  }
}

function createBuilder<
  Context extends object,
  Input extends AnySchema | undefined = undefined,
  Output extends AnySchema | undefined = undefined,
  Async extends boolean = false,
>(
  contextFactory: ProcedureContextFactory<Context> | undefined,
  middlewares: readonly ProcedureMiddleware<Context>[],
  inputSchema?: Input,
  outputSchema?: Output
): ProcedureBuilder<Context, Input, Output, Async> {
  const input = (<const Schema extends AnySchema>(schema: Schema) => {
    if (!isSchema(schema)) throw new TypeError('Procedure input must be a Standard Schema')
    return createBuilder(contextFactory, middlewares, schema, outputSchema)
  }) as ProcedureBuilder<Context, Input, Output, Async>['input']

  const output = (<const Schema extends AnySchema>(schema: Schema) => {
    if (!isSchema(schema)) throw new TypeError('Procedure output must be a Standard Schema')
    return createBuilder(contextFactory, middlewares, inputSchema, schema)
  }) as ProcedureBuilder<Context, Input, Output, Async>['output']

  const middleware = (<const Middleware extends ProcedureMiddleware<Context>>(handler: Middleware) => {
    assertMiddleware('Procedure', handler)
    return handler
  }) as ProcedureBuilder<Context, Input, Output, Async>['middleware']

  const use = (<const Middlewares extends readonly ProcedureMiddleware<Context>[]>(...applied: Middlewares) => {
    assertMiddlewares('Procedure', applied)
    return createBuilder(contextFactory, [...middlewares, ...applied], inputSchema, outputSchema)
  }) as ProcedureBuilder<Context, Input, Output, Async>['use']

  const handler = ((implementation: (args: ProcedureHandlerInput<Context, Input>) => Awaitable<unknown>) => {
    if (typeof implementation !== 'function') throw new TypeError('Procedure handler must be a function')
    const decodeInput =
      inputSchema === undefined ? undefined : compileApplicationSchemaValidation(inputSchema, { location: 'input' })
    const decodeOutput =
      outputSchema === undefined ? undefined : compileApplicationSchemaValidation(outputSchema, { location: 'output' })

    const callable = (...args: readonly unknown[]) => {
      const hasInput = inputSchema !== undefined
      const inputValue = hasInput ? args[0] : undefined
      const inputStep = decodeInput === undefined ? inputValue : decodeInput(inputValue)

      return mapSchemaStep(inputStep, (decodedInput) => {
        const contextStep =
          contextFactory === undefined ? (emptyProcedureContext as Context) : contextFactory({ input: decodedInput })

        return mapSchemaStep(contextStep, (context) => {
          if (!isRecord(context)) throw new TypeError('Procedure context factory must return an object')

          const middlewareInput = { context, input: decodedInput }
          const handlerInput = {
            context,
            ...(hasInput ? { input: decodedInput } : {}),
          } as ProcedureHandlerInput<Context, Input>
          const result =
            middlewares.length === 0
              ? implementation(handlerInput)
              : dispatchMiddlewareSteps(middlewares, middlewareInput, () => implementation(handlerInput), {
                  invalidMiddleware: () => new TypeError('Procedure middleware must be a function'),
                  multipleNext: () => new TypeError('Procedure middleware called next() more than once'),
                })
          return decodeOutput === undefined ? result : mapSchemaStep(result, decodeOutput)
        })
      })
    }

    return callable
  }) as unknown as ProcedureBuilder<Context, Input, Output, Async>['handler']

  return { input, output, handler, middleware, use }
}

export function defineProcedure(options?: { readonly context?: undefined }): ProcedureBuilder<EmptyProcedureContext>
export function defineProcedure<
  const Factory extends (input: ProcedureContextInput) => object | PromiseLike<object>,
>(options: {
  readonly context: Factory
}): ProcedureBuilder<Awaited<ReturnType<Factory>>, undefined, undefined, ValueIsAsync<ReturnType<Factory>>>
export function defineProcedure(options: { readonly context?: unknown } = {}): unknown {
  if (!isRecord(options)) throw new TypeError('Procedure options must be an object')
  if (options.context !== undefined && typeof options.context !== 'function') {
    throw new TypeError('Procedure context must be a function')
  }
  return createBuilder<object, undefined, undefined, boolean>(
    options.context as ProcedureContextFactory<object> | undefined,
    []
  )
}
