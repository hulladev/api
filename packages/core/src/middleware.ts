import type { ExecutionStep } from './execution'

export type MiddlewareInput<Context extends object, RequestType, Route> = {
  readonly context: Readonly<Context>
  readonly request: RequestType
  readonly route: Route
}

export type MiddlewareNext<Result> = () => Result

export type MiddlewareOptions<Input extends object, Result> = Input & {
  readonly next: MiddlewareNext<Result>
}

export function assertMiddleware(label: string, value: unknown): asserts value is (...args: never[]) => unknown {
  if (typeof value !== 'function') throw new TypeError(`${label} middleware must be a function`)
}

export function assertMiddlewares(
  label: string,
  values: readonly unknown[]
): asserts values is readonly ((...args: never[]) => unknown)[] {
  for (const value of values) assertMiddleware(label, value)
}

export type MiddlewarePlan<Middleware, Route> = readonly [
  all: readonly Middleware[],
  global: readonly Middleware[],
  routes?: ReadonlyMap<Route, readonly Middleware[]>,
]

export function createMiddlewarePlan<Middleware, Route>(): MiddlewarePlan<Middleware, Route> {
  return [[], []]
}

export function appendMiddlewarePlan<Middleware, Route>(
  label: string,
  plan: MiddlewarePlan<Middleware, Route>,
  values: readonly unknown[],
  routesFor: (node: unknown) => readonly Route[]
): MiddlewarePlan<Middleware, Route> {
  if (values.length === 1) {
    assertMiddleware(label, values[0])
    const middleware = values[0] as Middleware
    if (plan[2] === undefined)
      return [
        [...plan[0], middleware],
        [...plan[1], middleware],
      ]
    const routes = new Map(plan[2])
    for (const [route, middlewares] of routes) routes.set(route, [...middlewares, middleware])
    return [[...plan[0], middleware], [...plan[1], middleware], routes]
  }
  if (values.length !== 2) assertMiddleware(label, undefined)
  assertMiddleware(label, values[1])
  const middleware = values[1] as Middleware
  const routes = new Map(plan[2])
  for (const route of routesFor(values[0])) {
    routes.set(route, [...(routes.get(route) ?? plan[1]), middleware])
  }
  return [[...plan[0], middleware], plan[1], routes]
}

export function routeMiddlewares<Middleware, Route>(
  plan: MiddlewarePlan<Middleware, Route>,
  route: Route
): readonly Middleware[] {
  return plan[2]?.get(route) ?? plan[1]
}

export type MiddlewareDispatchErrors = {
  readonly invalidMiddleware: () => Error
  readonly multipleNext: () => Error
}

/** Executes middleware without introducing a promise when every layer is synchronous. */
export function dispatchMiddlewareSteps<Input extends object, Result>(
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

    return middleware({ ...input, next }) as ExecutionStep<Result>
  }

  return dispatch(0)
}
