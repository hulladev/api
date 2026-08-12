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
