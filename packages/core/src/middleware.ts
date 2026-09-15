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

export type MiddlewarePlan<Middleware, Route> = {
  readonly all: readonly Middleware[]
  readonly global: readonly Middleware[]
  readonly routes?: ReadonlyMap<Route, readonly Middleware[]>
}

export function createMiddlewarePlan<Middleware, Route>(): MiddlewarePlan<Middleware, Route> {
  return { all: [], global: [] }
}

export function appendMiddlewarePlan<Middleware, Route>(
  label: string,
  plan: MiddlewarePlan<Middleware, Route>,
  values: readonly unknown[],
  routesFor: (node: unknown) => readonly Route[]
): MiddlewarePlan<Middleware, Route> {
  if (values.length !== 1 && values.length !== 2) assertMiddleware(label, undefined)
  const candidate = values[values.length - 1]
  assertMiddleware(label, candidate)
  const middleware = candidate as Middleware
  const all = [...plan.all, middleware]
  if (values.length === 1) {
    const global = [...plan.global, middleware]
    if (plan.routes === undefined) return { all, global }
    const routes = new Map(plan.routes)
    for (const [route, stack] of routes) routes.set(route, [...stack, middleware])
    return { all, global, routes }
  }
  const routes = new Map(plan.routes)
  for (const route of routesFor(values[0])) routes.set(route, [...(routes.get(route) ?? plan.global), middleware])
  return { all, global: plan.global, routes }
}

export function routeMiddlewares<Middleware, Route>(
  plan: MiddlewarePlan<Middleware, Route>,
  route: Route
): readonly Middleware[] {
  return plan.routes?.get(route) ?? plan.global
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
