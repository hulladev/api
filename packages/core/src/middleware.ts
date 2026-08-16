import type { Awaitable } from './context'

export type MiddlewareInput<Context extends object, RequestType, Route> = {
  readonly context: Readonly<Context>
  readonly request: RequestType
  readonly route: Route
}

declare const middlewareNextResultType: unique symbol

export type MiddlewareNextResult<Value> = Value & {
  readonly [middlewareNextResultType]: Value
}

export type MiddlewareActions<Result> = {
  readonly next: () => Promise<MiddlewareNextResult<Result>>
}

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

/** Executes a middleware stack with a single-use next action at every layer. */
export async function dispatchMiddlewares<Input, Result, Actions extends object>(
  middlewares: readonly unknown[],
  input: Input,
  terminal: () => Awaitable<Result>,
  createActions: (next: () => Promise<Result>) => Actions,
  errors: MiddlewareDispatchErrors
): Promise<Result> {
  const dispatch = async (index: number): Promise<Result> => {
    if (index === middlewares.length) return terminal()

    const middleware = middlewares[index]
    if (typeof middleware !== 'function') throw errors.invalidMiddleware()

    let called = false
    const next = async (): Promise<Result> => {
      if (called) throw errors.multipleNext()
      called = true
      return dispatch(index + 1)
    }

    return middleware(Object.freeze(createActions(next)), input) as Promise<Result>
  }

  return dispatch(0)
}
