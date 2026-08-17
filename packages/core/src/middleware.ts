import type { Awaitable } from './context'
import type { ExecutionStep } from './execution'

export type MiddlewareInput<Context extends object, RequestType, Route> = {
  readonly context: Readonly<Context>
  readonly request: RequestType
  readonly route: Route
}

export type MiddlewareNext<Result> = () => Result

export type NextMiddleware<Context extends object, RequestType, Route> = <Result>(
  input: MiddlewareInput<Context, RequestType, Route>,
  next: MiddlewareNext<Promise<Result>>
) => Awaitable<Result>

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
export function dispatchMiddlewareSteps<Input, Result>(
  middlewares: readonly unknown[],
  input: Input,
  terminal: () => ExecutionStep<Result>,
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

    return middleware(input, next) as ExecutionStep<Result>
  }

  return dispatch(0)
}

/** Executes a middleware stack with a single-use next action at every layer. */
export async function dispatchMiddlewares<Input, Result>(
  middlewares: readonly unknown[],
  input: Input,
  terminal: () => Awaitable<Result>,
  errors: MiddlewareDispatchErrors
): Promise<Result> {
  const result = dispatchMiddlewareSteps(middlewares, input, async () => terminal(), errors)
  return result
}
