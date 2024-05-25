import type {
  API,
  AdapterMap,
  Adapters,
  AvailableCalls,
  Context,
  InvokerMap,
  MappedRouter,
  Obj,
  RouteArgs,
  RouteNames,
  RouteNamesWithMethod,
  RouteReturn,
  RouterAdapter,
  RouterConfig,
  RouterShape,
} from './types'
import { entries } from './utils'

/**
 * Function for creating router
 * @param context Passed context from the API
 * @returns A ready to use router-adapter
 */
export function router<const CTX extends Obj>(context: CTX) {
  return <
    const RouterName extends string,
    const Routes extends RouterShape,
    const AD extends Adapters<Routes, RouterName, CTX>,
  >(
    config: RouterConfig<RouterName, Routes, CTX, AD>
  ): API<Routes, RouterName, CTX, AD> => {
    const { name: routerName, routes, interceptors } = config
    const { args: argInterceptor, fn: fnInterceptor, resolver: resolverInterceptor } = interceptors ?? {}
    const routeNames: RouteNames<Routes>[] = []
    const methods: AvailableCalls<Routes>[] = []
    const mappedRouter = {} as MappedRouter<Routes>
    // we use a for const for a single iteration (faster than multiple maps/filters)
    for (const route of routes as Routes) {
      routeNames.push(route.route)
      methods.push(route.method)
      if (
        (mappedRouter[route.method as keyof MappedRouter<Routes>] ?? {})[
          route.route as keyof MappedRouter<Routes>[keyof MappedRouter<Routes>]
        ] !== undefined
      ) {
        throw new Error(`Route "${route.route}" with method "${route.method}" already exists`)
      }
      // note we use direct object assignment over spread/Object.assign as it's slightly faster
      // @ts-expect-error we use a dynamic mapping of methods which are not available before runtime
      mappedRouter[route.method] = mappedRouter[route.method] || {}
      // @ts-expect-error we use a dynamic mapping of methods which are not available before runtime
      mappedRouter[route.method][route.route] = route
    }

    /**
     * internal helper for find a request/procedure
     * @param method either a 'call' or one of the request methods
     * @param name name matching the call
     * @returns the Call<> object with { route (key-string), call (definition) } properties
     */
    const find = <CN extends AvailableCalls<Routes>, N extends RouteNamesWithMethod<Routes, CN>>(
      method: CN,
      name: N
    ) => {
      const match = mappedRouter[method]?.[name] as Routes[number]
      if (!match) {
        throw new Error(
          `${method === 'call' ? 'Procedure' : 'Request'} "${name.toString()}" with method "${method}" not found`
        )
      }
      return { route: match.route, call: match }
    }

    /**
     * internal helper for invoking a request/procedure
     * @param method either a 'call' or one of the request methods
     * @param name name matching the call
     * @param args (type-safe) arguments to pass to the call
     * @returns returntype of the call (if resolver, resolver type, otherwise fn type)
     */
    const invoke = <
      CN extends AvailableCalls<Routes>,
      N extends RouteNamesWithMethod<Routes, CN>,
      A extends RouteArgs<Routes, CN, N>,
    >(
      method: CN,
      name: N,
      args: A
    ): RouteReturn<Routes, CN, N> => {
      const { route, call } = find(method, name)
      // @ts-expect-error by object definition, key can potentially be a | number | symbol, but
      // we always treat them as string
      const ctx: CTX & Context<N, CN, A, RouterName> = {
        ...context,
        routerName,
        route,
        args,
        type: call.method === 'call' ? 'procedure' : call.method,
        method,
      }
      // format args with argInterceptor (if available)
      let a = args
      if (argInterceptor) {
        a = argInterceptor(ctx) as A
      }
      // use resolver if provided
      const fnCall = () => (fnInterceptor ? fnInterceptor({ ...ctx, result: call.fn(...a) }) : call.fn(...a))
      if (call.resolver) {
        const resolverCall = () => call.resolver?.(fnCall(), ctx)
        return resolverInterceptor ? resolverInterceptor({ ...ctx, result: resolverCall() }) : resolverCall()
      }
      // otherwise just call fn
      return fnCall()
    }

    /**
     * internal API for calling requests (user is exposed individual methods @see invokerMap
     * @param method method of the request
     * @param name name of the request
     * @param args arguments to pass to the request
     * @returns Return type of the request
     */
    const methodInvoker =
      <M extends AvailableCalls<Routes>>(method: M) =>
      <N extends RouteNamesWithMethod<Routes, M>>(
        name: N,
        ...args: RouteArgs<Routes, M, N>
      ): RouteReturn<Routes, M, N> => {
        return invoke(method, name, args)
      }

    /**
     * user facing API for invoking procedures and requests
     */
    const invokerMap = methods.reduce(
      (acc, method) => ({
        ...acc,
        [method]: methodInvoker(method),
      }),
      {} as InvokerMap<Routes>
    )

    const api = {
      ...invokerMap,
      context,
      routeNames,
      routerName,
      methods,
    } as API<Routes, RouterName, CTX, AD>

    if (config.adapters) {
      const apiWidthAdapters = {
        ...api,
        mappedRouter,
        find,
        invoke,
      } as RouterAdapter<Routes, RouterName, CTX>
      return {
        ...api,
        ...entries(config.adapters).reduce(
          (acc, [adapterName, adapterVal]) => {
            acc[adapterName] = adapterVal(apiWidthAdapters)
            return acc
          },
          {} as AdapterMap<Routes, RouterName, CTX, AD>
        ),
      }
    }

    return api
  }
}
