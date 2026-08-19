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
import type {
  APIPlugin,
  APIPluginTypeOpaque,
  APIProcedureArgs,
  APIProcedureIfInput,
  APIProcedureKey,
  APIProcedureKeyPrefix,
  APIProcedureOverloads,
  APIProcedurePluginCall,
  APIProcedurePluginKey,
  APIProcedurePluginList,
  APIProcedureResult,
} from './plugin'
import { normalizeAPIPlugins } from './plugin-runtime'
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

function isProcedureContextFactory(value: unknown): value is ProcedureContextFactory<object> {
  return typeof value === 'function'
}

export type DefineProceduresOptions<Context extends object, Plugins extends APIProcedurePluginList = readonly []> = {
  readonly context?: ProcedureContextFactory<Context>
  readonly plugins?: Plugins
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
  Plugins extends APIProcedurePluginList = readonly [],
> = ProcedureType & {
  readonly $meta: Readonly<ProcedureMetadata<Key>>
} & ProcedurePluginExtensions<Plugins, ProcedureType, Key>

export type ProcedureTree = {
  readonly [key: string]: AnyProcedure | ProcedureTree
}

export type BuiltProcedureTree<
  Tree extends ProcedureTree,
  Prefix extends readonly string[] = readonly [],
  Plugins extends APIProcedurePluginList = readonly [],
> = Readonly<{
  [Key in keyof Tree]: Tree[Key] extends AnyProcedure
    ? BoundProcedure<Tree[Key], readonly [...Prefix, Extract<Key, string>], Plugins>
    : Tree[Key] extends ProcedureTree
      ? BuiltProcedureTree<Tree[Key], readonly [...Prefix, Extract<Key, string>], Plugins> &
          ProcedurePluginRouterExtensions<Plugins, readonly [...Prefix, Extract<Key, string>]>
      : never
}>

type ResolveProcedurePluginArguments<Arguments, ProcedureType extends AnyProcedure, Key extends readonly string[]> = [
  Arguments,
] extends [APIProcedureArgs]
  ? Parameters<ProcedureType>
  : Arguments extends readonly unknown[]
    ? {
        [Index in keyof Arguments]: ResolveProcedurePluginType<Arguments[Index], ProcedureType, Key>
      }
    : never

type ResolveProcedurePluginType<Value, ProcedureType extends AnyProcedure, Key extends readonly string[]> = [
  Value,
] extends [APIProcedureArgs]
  ? Parameters<ProcedureType>
  : [Value] extends [APIProcedureIfInput<infer WhenInput, infer WhenNoInput>]
    ? Parameters<ProcedureType> extends readonly []
      ? ResolveProcedurePluginType<WhenNoInput, ProcedureType, Key>
      : ResolveProcedurePluginType<WhenInput, ProcedureType, Key>
    : [Value] extends [APIProcedureOverloads<readonly [infer First, infer Second]>]
      ? ResolveProcedurePluginType<First, ProcedureType, Key> extends (
          ...args: infer FirstArguments
        ) => infer FirstResult
        ? ResolveProcedurePluginType<Second, ProcedureType, Key> extends (
            ...args: infer SecondArguments
          ) => infer SecondResult
          ? {
              (...args: SecondArguments): SecondResult
              (...args: FirstArguments): FirstResult
            }
          : never
        : never
      : [Value] extends [APIProcedureKey]
        ? readonly [...Key, ...Parameters<ProcedureType>]
        : [Value] extends [APIProcedureKeyPrefix]
          ? readonly [...Key]
          : [Value] extends [APIProcedureResult]
            ? ReturnType<ProcedureType>
            : Value extends APIPluginTypeOpaque<infer Opaque>
              ? Opaque
              : Value extends (...args: infer Arguments) => infer Result
                ? (
                    ...args: ResolveProcedurePluginArguments<Arguments, ProcedureType, Key>
                  ) => ResolveProcedurePluginType<Result, ProcedureType, Key>
                : Value extends readonly unknown[]
                  ? {
                      [Index in keyof Value]: ResolveProcedurePluginType<Value[Index], ProcedureType, Key>
                    }
                  : Value extends object
                    ? {
                        [Member in keyof Value]: ResolveProcedurePluginType<Value[Member], ProcedureType, Key>
                      }
                    : Value

type HookTypeMap<Hook, Marker extends PropertyKey> = Marker extends keyof Hook
  ? Exclude<Hook[Marker], undefined>
  : never

type PluginProcedureTypes<Plugin> = Plugin extends { readonly procedures?: infer Procedures }
  ? Exclude<Procedures, undefined> extends { readonly procedure?: infer Hook }
    ? HookTypeMap<Exclude<Hook, undefined>, 'hulla.api.procedurePluginTypes'>
    : never
  : never

type PrefixPluginMembers<Value> = Value extends object
  ? {
      readonly [Member in keyof Value as Member extends string ? `$${Member}` : never]: Value[Member]
    }
  : object

type PluginProcedureExtension<Plugin, ProcedureType extends AnyProcedure, Key extends readonly string[]> = [
  PluginProcedureTypes<Plugin>,
] extends [never]
  ? object
  : PrefixPluginMembers<ResolveProcedurePluginType<PluginProcedureTypes<Plugin>, ProcedureType, Key>>

type UnionToIntersection<Union> = (Union extends unknown ? (value: Union) => void : never) extends (
  value: infer Intersection
) => void
  ? Intersection
  : never

type ProcedurePluginExtensions<
  Plugins extends APIProcedurePluginList,
  ProcedureType extends AnyProcedure,
  Key extends readonly string[],
> = UnionToIntersection<
  Plugins[number] extends infer Plugin ? PluginProcedureExtension<Plugin, ProcedureType, Key> : never
>

type ResolveProcedurePluginRouterType<Value, Key extends readonly string[]> = [Value] extends [APIProcedureKeyPrefix]
  ? readonly [...Key]
  : Value extends APIPluginTypeOpaque<infer Opaque>
    ? Opaque
    : Value extends (...args: infer Arguments) => infer Result
      ? (...args: Arguments) => ResolveProcedurePluginRouterType<Result, Key>
      : Value extends readonly unknown[]
        ? {
            [Index in keyof Value]: ResolveProcedurePluginRouterType<Value[Index], Key>
          }
        : Value extends object
          ? {
              [Member in keyof Value]: ResolveProcedurePluginRouterType<Value[Member], Key>
            }
          : Value

type PluginProcedureRouterTypes<Plugin> = Plugin extends { readonly procedures?: infer Procedures }
  ? Exclude<Procedures, undefined> extends { readonly router?: infer Hook }
    ? HookTypeMap<Exclude<Hook, undefined>, 'hulla.api.procedurePluginRouterTypes'>
    : never
  : never

type PluginProcedureRouterExtension<Plugin, Key extends readonly string[]> = [
  PluginProcedureRouterTypes<Plugin>,
] extends [never]
  ? object
  : PrefixPluginMembers<ResolveProcedurePluginRouterType<PluginProcedureRouterTypes<Plugin>, Key>>

type ProcedurePluginRouterExtensions<
  Plugins extends APIProcedurePluginList,
  Key extends readonly string[],
> = UnionToIntersection<Plugins[number] extends infer Plugin ? PluginProcedureRouterExtension<Plugin, Key> : never>

type ProcedureExecution = (args: readonly unknown[], metadata: ProcedureMetadata) => unknown

type ProcedureRuntime = {
  readonly execute: ProcedureExecution
  readonly hasInput: boolean
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
  Plugins extends APIProcedurePluginList = readonly [],
> = {
  readonly plugins: Plugins
  readonly input: <const Schema extends AnySchema>(
    schema: Schema
  ) => ProcedureBuilder<Context, Schema, Output, EitherIsAsync<Async, SchemaIsAsync<Schema>>, Plugins>
  readonly output: <const Schema extends AnySchema>(
    schema: Schema
  ) => ProcedureBuilder<Context, Input, Schema, EitherIsAsync<Async, SchemaIsAsync<Schema>>, Plugins>
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
  ) => ProcedureBuilder<Context, Input, Output, EitherIsAsync<Async, AnyMiddlewareIsAsync<Middlewares>>, Plugins>
  readonly build: <const Tree extends ProcedureTree>(tree: Tree) => BuiltProcedureTree<Tree, readonly [], Plugins>
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

function procedurePluginKey(key: readonly string[]): APIProcedurePluginKey {
  const prefix = Object.freeze([...key])
  return Object.freeze({
    prefix,
    full: (...args: readonly unknown[]) => [...prefix, ...args],
  })
}

function attachProcedurePluginMembers(
  target: object,
  plugin: APIPlugin,
  members: Readonly<Record<string, unknown>>,
  owners: Map<string, string>,
  targetKind: 'procedure' | 'router'
): void {
  for (const [key, value] of Object.entries(members)) {
    if (key.startsWith('$')) {
      throw new TypeError(
        `Procedure plugin "${plugin.id}" ${targetKind} member "${key}" must omit the framework-owned "$" prefix`
      )
    }

    const publicKey = `$${key}`
    if (publicKey === '$meta') {
      throw new TypeError(`Procedure plugin "${plugin.id}" ${targetKind} member "$meta" is reserved by @hulla/api`)
    }

    const owner = owners.get(publicKey)
    if (owner !== undefined) {
      throw new TypeError(
        `Procedure plugin "${plugin.id}" ${targetKind} member "${publicKey}" collides with plugin "${owner}"`
      )
    }
    if (publicKey in target) {
      throw new TypeError(
        `Procedure plugin "${plugin.id}" ${targetKind} member "${publicKey}" collides with the ${targetKind}`
      )
    }

    Object.defineProperty(target, publicKey, { enumerable: true, value })
    owners.set(publicKey, plugin.id)
  }
}

function applyProcedurePlugins(
  call: APIProcedurePluginCall,
  hasInput: boolean,
  key: readonly string[],
  plugins: readonly APIPlugin[]
): void {
  const pluginKey = procedurePluginKey(key)
  const owners = new Map<string, string>()

  for (const plugin of plugins) {
    const hook = plugin.procedures?.procedure
    if (hook === undefined) continue
    const members = hook({ call, hasInput, key: pluginKey })
    if (members === undefined) continue
    if (!isRecord(members)) throw new TypeError(`Procedure plugin "${plugin.id}" hook must return an object`)
    attachProcedurePluginMembers(call, plugin, members, owners, 'procedure')
  }
}

function applyProcedureRouterPlugins(
  router: Record<string, unknown>,
  key: readonly string[],
  plugins: readonly APIPlugin[]
): void {
  const pluginKey = procedurePluginKey(key)
  const owners = new Map<string, string>()

  for (const plugin of plugins) {
    const hook = plugin.procedures?.router
    if (hook === undefined) continue
    const members = hook({ key: pluginKey })
    if (members === undefined) continue
    if (!isRecord(members)) throw new TypeError(`Procedure plugin "${plugin.id}" router hook must return an object`)
    attachProcedurePluginMembers(router, plugin, members, owners, 'router')
  }
}

function bindProcedure(
  procedure: AnyProcedure,
  owner: object,
  key: readonly string[],
  plugins: readonly APIPlugin[]
): BoundProcedure<AnyProcedure> {
  const runtime = procedureRuntimes.get(procedure)
  if (runtime === undefined) {
    throw new TypeError(`Procedure tree member "${key.join('.')}" must be a procedure or nested object`)
  }
  if (runtime.owner !== owner) {
    throw new TypeError(`Procedure "${key.join('.')}" belongs to a different procedure definition`)
  }

  const metadata = Object.freeze({ kind: 'procedure' as const, key: Object.freeze([...key]) })
  const call = (...args: readonly unknown[]) => runtime.execute(args, metadata)
  const callable = call as unknown as AnyProcedure
  registerProcedure(callable, runtime, metadata)
  applyProcedurePlugins(call, runtime.hasInput, key, plugins)
  return Object.freeze(callable) as unknown as BoundProcedure<AnyProcedure>
}

function buildProcedureTree(
  tree: ProcedureTree,
  owner: object,
  prefix: readonly string[],
  trees: Map<object, string>,
  procedures: Map<AnyProcedure, string>,
  plugins: readonly APIPlugin[]
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
      setOwn(result, key, bindProcedure(executable, owner, childKey, plugins))
      continue
    }

    if (!isPlainRecord(value)) {
      throw new TypeError(`Procedure tree member "${childLocation}" must be a procedure or nested object`)
    }
    setOwn(result, key, buildProcedureTree(value as ProcedureTree, owner, childKey, trees, procedures, plugins))
  }

  if (prefix.length > 0) applyProcedureRouterPlugins(result, prefix, plugins)
  return Object.freeze(result)
}

function createBuilder<
  Context extends object,
  Input extends AnySchema | undefined = undefined,
  Output extends AnySchema | undefined = undefined,
  Async extends boolean = false,
  Plugins extends APIProcedurePluginList = readonly [],
>(
  owner: object,
  contextFactory: ProcedureContextFactory<Context> | undefined,
  middlewares: readonly ProcedureMiddleware<Context>[],
  plugins: Plugins,
  inputSchema?: Input,
  outputSchema?: Output
): ProcedureBuilder<Context, Input, Output, Async, Plugins> {
  const middlewareStack = [...middlewares]

  const input = (<const Schema extends AnySchema>(schema: Schema) => {
    if (!isSchema(schema)) throw new TypeError('Procedure input must be a Standard Schema')
    return createBuilder(owner, contextFactory, middlewareStack, plugins, schema, outputSchema)
  }) as ProcedureBuilder<Context, Input, Output, Async, Plugins>['input']

  const output = (<const Schema extends AnySchema>(schema: Schema) => {
    if (!isSchema(schema)) throw new TypeError('Procedure output must be a Standard Schema')
    return createBuilder(owner, contextFactory, middlewareStack, plugins, inputSchema, schema)
  }) as ProcedureBuilder<Context, Input, Output, Async, Plugins>['output']

  const middleware = (<const Middleware extends ProcedureMiddleware<Context>>(handler: Middleware) => {
    assertMiddleware('Procedure', handler)
    return handler
  }) as ProcedureBuilder<Context, Input, Output, Async, Plugins>['middleware']

  const use = (<const Middlewares extends readonly ProcedureMiddleware<Context>[]>(...applied: Middlewares) => {
    assertMiddlewares('Procedure', applied)
    return createBuilder(owner, contextFactory, [...middlewareStack, ...applied], plugins, inputSchema, outputSchema)
  }) as ProcedureBuilder<Context, Input, Output, Async, Plugins>['use']

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
    registerProcedure(callable, { execute, hasInput: inputSchema !== undefined, owner })
    return Object.freeze(callable)
  }) as unknown as ProcedureBuilder<Context, Input, Output, Async, Plugins>['handler']

  const build = (<const Tree extends ProcedureTree>(tree: Tree): BuiltProcedureTree<Tree, readonly [], Plugins> => {
    const procedures = buildProcedureTree(tree, owner, [], new Map(), new Map(), plugins)
    for (const plugin of plugins) plugin.procedures?.build?.({ procedures })
    return procedures as BuiltProcedureTree<Tree, readonly [], Plugins>
  }) as ProcedureBuilder<Context, Input, Output, Async, Plugins>['build']

  return Object.freeze({ plugins, input, output, handler, middleware, use, build })
}

export function defineProcedures<const Plugins extends APIProcedurePluginList = readonly []>(options?: {
  readonly context?: undefined
  readonly plugins?: Plugins
}): ProcedureBuilder<EmptyProcedureContext, undefined, undefined, false, Plugins>
export function defineProcedures<
  const Factory extends (input: ProcedureContextInput) => object | PromiseLike<object>,
  const Plugins extends APIProcedurePluginList = readonly [],
>(options: {
  readonly context: Factory
  readonly plugins?: Plugins
}): ProcedureBuilder<Awaited<ReturnType<Factory>>, undefined, undefined, ValueIsAsync<ReturnType<Factory>>, Plugins>
export function defineProcedures(
  options: { readonly context?: unknown; readonly plugins?: APIProcedurePluginList } = {}
): unknown {
  if (!isRecord(options)) throw new TypeError('Procedure options must be an object')
  if (options.context !== undefined && !isProcedureContextFactory(options.context)) {
    throw new TypeError('Procedure context must be a function')
  }
  const plugins = normalizeAPIPlugins(options.plugins, 'procedures')
  return createBuilder<object, undefined, undefined, boolean, APIProcedurePluginList>({}, options.context, [], plugins)
}
