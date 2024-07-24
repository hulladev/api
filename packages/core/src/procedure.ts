import type {
  Args,
  Fn,
  InputArgs,
  InputResult,
  MiddlewareOptions,
  Obj,
  OutputFn,
  ProcedureMeta,
  ResContext,
  ResOutput,
  Schema,
  SomePromise,
} from './types'

export const uniteInput = <A extends Args, R, I extends Schema<A, R, PK> | Fn<A, R>, PK extends string>(
  sofn: I,
  parseKey: PK
): ((...args: InputArgs<I, PK>) => InputResult<I, PK>) =>
  typeof sofn === 'function'
    ? (sofn as (...args: InputArgs<I, PK>) => InputResult<I, PK>)
    : (...args: InputArgs<I, PK>) => (sofn as Schema<A, R, PK>)[parseKey](...(args as A)) as InputResult<I, PK>

export const uniteOutput = <OA extends Args, O, PK extends string>(
  sofn: Schema<OA, O, PK> | OutputFn<O>,
  parseKey: PK
) => (typeof sofn === 'function' ? sofn : (...outputArgs: OA) => (sofn as Schema<OA, O, PK>)[parseKey](...outputArgs))

export function procedure<
  const DCTX extends Obj, // default context
  const CTX extends
    | Obj
    | ((options: MiddlewareOptions<DCTX, PK, G, DM, DI>) => Obj)
    | ((options: MiddlewareOptions<DCTX, PK, G, DM, DI>) => Promise<Obj>), // custom context
  const PK extends string, // parseKey
  const DM extends AM, // defaultMethod
  const G extends string, // group
  const DI extends Schema<any, any, PK> | Fn<any, any> | undefined = undefined, // input
  const DO extends Schema<any, any, PK> | OutputFn<any> | undefined = undefined, // output
  const AM extends string = string,
>({
  context: customContext,
  defaultContext,
  parseKey,
  defaultMethod,
  defaultInput,
  defaultOutput,
  group,
}: {
  context: CTX
  parseKey: PK
  defaultMethod: DM
  group: G
  defaultInput?: DI
  defaultOutput?: DO
  defaultContext: DCTX
  allowedMethods?: AM
}) {
  return <N extends string, M extends AM = DM extends AM ? DM : never>(
    name: N,
    method: M = defaultMethod as unknown as M
  ) => {
    const meta: ProcedureMeta<N, M, G> = {
      route: name,
      method,
      group,
    }
    const createContext = <I extends Schema<any, any, PK> | Fn<any, any>>(
      input?: InputResult<I, PK>
    ): ResContext<CTX> =>
      (typeof customContext === 'function'
        ? customContext({
            context: defaultContext,
            meta: meta as unknown as ProcedureMeta<string, DM, G>,
            // @ts-expect-error ts cannot know in advance wether the input will match
            input,
          })
        : customContext ?? defaultContext) as ResContext<CTX>

    type Resolve<O, I extends Schema<any, any, PK> | Fn<any, any> | undefined> = {
      name: N
      method: M
      fn: SomePromise<[CTX, DI, DO]> extends true
        ? (...args: InputArgs<I, PK>) => Promise<O>
        : (...args: InputArgs<I, PK>) => O
    }

    type FnVariants<O, I> = (data: {
      context: ResContext<CTX>
      meta: ProcedureMeta<N, M, G>
      input: InputResult<I, PK>
    }) => O

    /**
     * Internal function to resolve the procedure
     * @private
     * @param { InputDeviceInfo, outputFn, fn } param0 Inputs based on procedure chains
     * @returns A single Route<> definition
     */
    const resolve = <I extends Schema<any, any, PK> | Fn<any, any> | undefined, O, F extends FnVariants<O, I>>({
      inputFn,
      outputFn,
      fn,
    }: {
      inputFn?: I
      outputFn?: Schema<any, O, PK> | OutputFn<O>
      fn: F
    }): Resolve<O, I> => {
      return {
        name,
        method,
        // @ts-expect-error we fake sync/async functions into a single "sync-like" function. There will always be type mismatch
        fn: (...args: InputArgs<I, PK>) => {
          const getRes = (...args: InputArgs<I, PK>) => {
            const input = uniteInput(inputFn ?? defaultInput ?? (() => undefined), parseKey)(...args) as InputResult<
              I,
              PK
            >

            if (input instanceof Promise) {
              return input.then((input) => {
                const context = createContext(input)
                if (context instanceof Promise) {
                  return context.then((context) => fn({ context, meta, input }))
                }
                return fn({ context, meta, input })
              })
            }
            // @ts-expect-error we dont care if we send incorrect input type to the context helper.
            const context = createContext(input)
            if (context instanceof Promise) {
              return context.then((context) => fn({ context, meta, input }))
            }
            return fn({ context, meta, input })
          }
          const res = getRes(...args)
          // technically it's O | Promise<O> but it's up to user to correctly handle promises in output
          const output = uniteOutput(outputFn ?? defaultOutput ?? (() => res as O), parseKey)(res as O)
          return output
        },
      }
    }
    // dev note: bit silly, but we'll need to tsdoc multiple times since it's nested variant calls
    // (and we cant re-use the same definitions, since they always slightly differ)

    /**
     * Submits a procedure to the route
     * @param fn function that executes your procedure code
     * @returns result of your procedure
     */
    const define = <O extends DO extends undefined ? any : ResOutput<PK, DO>>(
      fn: (
        data: DI extends undefined
          ? {
              context: ResContext<CTX>
              meta: ProcedureMeta<N, M, G>
            }
          : {
              context: ResContext<CTX>
              meta: ProcedureMeta<N, M, G>
              input: InputResult<DI, PK>
            }
      ) => O
    ) =>
      // @ts-expect-error dyanmic data args
      resolve<DI, O, typeof fn>({ fn, inputFn: defaultInput, outputFn: defaultOutput })

    /**
     * Creates an input validator / mutator
     * @param schemaOrFn either a schema or function that validates/mutates the input
     * @returns function chains (methods) for defining your procedure
     */
    const createInput = <const IA extends Args, IR, const I extends Schema<IA, IR, PK> | Fn<IA, IR>>(schemaOrFn: I) => {
      return {
        /**
         * Creates an output util to help you mutate / valdiate & narrow down type in `.define`
         * @param schemaOrFn Output validator definition
         * @returns Resulting output value
         */
        output: <OA extends Args, O>(schemaOrFnOut: Schema<OA, O, PK> | OutputFn<O>) => {
          return {
            /**
             * Submits a procedure to the route
             * @param fn function that executes your procedure code
             * @returns result of your procedure
             */
            define: (
              fn: (data: { context: ResContext<CTX>; meta: ProcedureMeta<N, M, G>; input: InputResult<I, PK> }) => O
            ) => resolve<I, O, typeof fn>({ inputFn: schemaOrFn, fn, outputFn: schemaOrFnOut }),
          }
        },
        /**
         * Submits a procedure to the route
         * @param fn function that executes your procedure code
         * @returns result of your procedure
         */
        define: <O extends DO extends undefined ? any : ResOutput<PK, DO>>(
          fn: (data: { context: ResContext<CTX>; meta: ProcedureMeta<N, M, G>; input: InputResult<I, PK> }) => O
        ) => resolve<I, O, typeof fn>({ inputFn: schemaOrFn, fn, outputFn: defaultOutput }),
      }
    }

    /**
     * Creates an output util to help you mutate / valdiate & narrow down type in `.define`
     * @param schemaOrFn Output validator definition
     * @returns Resulting output value
     */
    const createOutput = <OA extends Args, O>(schemaOrFnOut: Schema<OA, O, PK> | OutputFn<O>) => {
      return {
        /**
         * Creates an input validator / mutator
         * @param schemaOrFn either a schema or function that validates/mutates the input
         * @returns function chains (methods) for defining your procedure
         */
        input: <const IA extends Args, IR, const I extends Schema<IA, IR, PK> | Fn<IA, IR>>(schemaOrFn: I) => {
          return {
            /**
             * Submits a procedure to the route
             * @param fn function that executes your procedure code
             * @returns result of your procedure
             */
            define: (
              fn: (data: { context: ResContext<CTX>; meta: ProcedureMeta<N, M, G>; input: InputResult<I, PK> }) => O
            ) => resolve<I, O, typeof fn>({ inputFn: schemaOrFn, outputFn: schemaOrFnOut, fn }),
          }
        },
        /**
         * Submits a procedure to the route
         * @param fn function that executes your procedure code
         * @returns result of your procedure
         */
        define: (
          fn: (
            data: DI extends undefined
              ? { context: ResContext<CTX>; meta: ProcedureMeta<N, M, G> }
              : { context: ResContext<CTX>; meta: ProcedureMeta<N, M, G>; input: InputResult<DI, PK> }
          ) => O
          // @ts-expect-error dyanmic data args
        ) => resolve<DI, O, typeof fn>({ fn, outputFn: schemaOrFnOut, inputFn: defaultInput }),
      }
    }

    return {
      input: createInput,
      output: createOutput,
      define,
    }
  }
}
