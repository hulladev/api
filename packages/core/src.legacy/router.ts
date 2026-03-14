import type {
  API,
  Adapters,
  Args,
  ExactRoute,
  Methods,
  Obj,
  RouteArgs,
  RouteNamesWithMethod,
  RouteReturn,
  RouterConfig,
  RouterMap,
  Routes,
} from './types'

export function router<CTX extends Obj, PK extends string>({ context }: { context: CTX; parseKey: PK }) {
  return <const N extends string, const R extends Routes, AD extends Adapters<CTX, PK, R, N>>({
    name,
    routes,
    adapters,
  }: RouterConfig<N, R, CTX, PK, AD>): API<R, N, CTX, PK, AD> => {
    /**
     * mapping of individual routes based on their method
     * @example
     * {
     *  call: {
     *    foo: Route,
     *    bar: Route
     *  },
     *  customMethod: {
     *    baz: Route
     *  }
     * }
     * @private
     */
    const routerMap = {} as RouterMap<R>
    /**
     * base return of the api
     */
    const result = {
      name,
      context,
    } as API<R, N, CTX, PK, AD>

    // we'll need to loop over the individual routes and create method invocations for them
    // i.e. attach .call() to the API export
    for (const route of routes) {
      const method = route.method as keyof RouterMap<R>
      if (routerMap[method] === undefined) {
        routerMap[method] = {} as RouterMap<R>[keyof RouterMap<R>]
      }
      // @ts-expect-error dynamic mapping with unknown values
      routerMap[method][route.name] = route
      // @ts-expect-error we dont exact about exact types, here this just acts as a invocation layer
      // proper types are in the API<> type
      result[method] = <RN extends RouteNamesWithMethod<R, Methods<R>>, A extends RouteArgs<R, Methods<R>, RN>>(
        route: RN,
        ...input: A
      ) => invoke(method, route, ...input)
    }

    /**
     * Fetches the exact route based on method and route
     * @param method method of the route
     * @param route name of the route
     * @private
     * @warn Calling getRoute(method, route).fn() will execute input/output mutators, but not interceptors ⚠️!
     * @returns The exact route match (throws Error if fails)
     */
    const getRoute = <M extends Methods<R>, RN extends RouteNamesWithMethod<R, M>>(method: M, route: RN) => {
      const match = routerMap[method]?.[route] as ExactRoute<R, M, RN> | undefined
      //This should be rare, as typescript will raise a type-error if you even tried to do this incorrectly
      if (match === undefined) {
        throw new Error(`[@hulla/api]: Unable to find route ${route.toString()} with method ${method.toString()}`)
      }
      return match
    }

    /**
     * calls the exact route with any possible interceptors
     * @param method method of the route
     * @param route name of the route
     * @param input arguments of the route fn
     * @augments getRoute
     * @private
     * @returns return of the route (with interceptors)
     */
    const invoke = <
      const M extends Methods<R>,
      const RN extends RouteNamesWithMethod<R, M>,
      const A extends RouteArgs<R, M, RN>,
    >(
      method: M,
      route: RN,
      ...args: A
    ): RouteReturn<R, M, RN> => {
      const match = getRoute(method, route)
      /**
       * don't forget: input and output validation runs in the fn() itself
       * @see procedure
       */
      return match.fn(...(args as Args)) as RouteReturn<R, M, RN>
    }

    // last but not least, attach any router adapters to the resulting API export 🧪
    for (const [adapter, createAdapter] of Object.entries(adapters ?? ({} as AD))) {
      // @ts-expect-error generic mapping is impossible
      result[adapter] = createAdapter<R, N, I>({ ...result, context, routerMap, getRoute, invoke })
    }

    return result
  }
}
