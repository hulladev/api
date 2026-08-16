import type { Awaitable } from './context'
import type { ExecutionStep } from './execution'

export type MiddlewareInput<Context extends object, RequestType, Route> = {
  readonly context: Readonly<Context>
  readonly request: RequestType
  readonly route: Route
}

declare const middlewareNextResultType: unique symbol

export type MiddlewareNextResult<Value> = Value & {
  readonly [middlewareNextResultType]: Value
}

export type NextActions<NextResult> = {
  readonly next: () => NextResult
}

export type MiddlewareActions<Result> = NextActions<Promise<MiddlewareNextResult<Result>>>

export type NextMiddleware<Context extends object, RequestType, Route> = <Result>(
  actions: MiddlewareActions<Result>,
  input: MiddlewareInput<Context, RequestType, Route>
) => Awaitable<MiddlewareNextResult<Result>>

export function assertMiddleware(label: string, value: unknown): asserts value is (...args: never[]) => unknown {
  if (typeof value !== 'function') throw new TypeError(`${label} middleware must be a function`)
}

export function assertMiddlewares(
  label: string,
  values: readonly unknown[]
): asserts values is readonly ((...args: never[]) => unknown)[] {
  for (const value of values) assertMiddleware(label, value)
}

export type MiddlewareDispatchErrors = {
  readonly invalidMiddleware: () => Error
  readonly multipleNext: () => Error
}

/** Executes middleware without introducing a promise when every layer is synchronous. */
export function dispatchMiddlewareSteps<Input, Result, Actions extends object>(
  middlewares: readonly unknown[],
  input: Input,
  terminal: () => ExecutionStep<Result>,
  createActions: (next: () => ExecutionStep<Result>) => Actions,
  errors: MiddlewareDispatchErrors
): ExecutionStep<Result> {
  const dispatch = (index: number): ExecutionStep<Result> => {
    if (index === middlewares.length) return terminal()

    const middleware = middlewares[index]
    if (typeof middleware !== 'function') throw errors.invalidMiddleware()

    let called = false
    const next = (): ExecutionStep<Result> => {
      if (called) throw errors.multipleNext()
      called = true
      return dispatch(index + 1)
    }

    return middleware(Object.freeze(createActions(next)), input) as ExecutionStep<Result>
  }

  return dispatch(0)
}

/** Executes a middleware stack with a single-use next action at every layer. */
export async function dispatchMiddlewares<Input, Result, Actions extends object>(
  middlewares: readonly unknown[],
  input: Input,
  terminal: () => Awaitable<Result>,
  createActions: (next: () => Promise<Result>) => Actions,
  errors: MiddlewareDispatchErrors
): Promise<Result> {
  const result = dispatchMiddlewareSteps(
    middlewares,
    input,
    async () => terminal(),
    (next) => createActions(async () => next()),
    errors
  )
  return result
}
