// import { api } from '.'
import type { Call, CallNames, Context } from './call'
import type { Obj } from './types'

type Route = Call<string, CallNames, any, any, any, any>
export type RouterShape = readonly Route[]

type RouteNames<Routes extends RouterShape> = Routes[number]['route']
export type AvailableCalls<Routes extends RouterShape> = Routes[number]['method']
// returns a { [method]: { [route]: Call } } nested type map
export type MappedRouter<Routes extends RouterShape> = {
  [M in AvailableCalls<Routes>]: {
    [N in RouteNamesWithMethod<Routes, M>]: Find<Routes, M, N>
  }
}
export type RouterMap<Routes extends RouterShape> = Routes extends readonly [
  Call<infer N, infer M, infer CTX, infer A, infer R, infer R2>,
  ...infer Rest,
]
  ? [Call<N, M, CTX, A, R, R2>, ...(Rest extends RouterShape ? RouterMap<Rest> : [])]
  : []
export type FilterMethod<Routes extends RouterShape, M extends AvailableCalls<Routes>> =
  RouterMap<Routes> extends [Call<infer N, infer Method, infer CTX, infer A, infer R, infer R2>, ...infer Rest]
    ? Method extends M
      ? [Call<N, Method, CTX, A, R, R2>, ...(Rest extends RouterShape ? FilterMethod<Rest, M> : [])]
      : Rest extends RouterShape
        ? FilterMethod<Rest, M>
        : []
    : []
export type RouteNamesWithMethod<Routes extends RouterShape, M extends AvailableCalls<Routes>> = FilterMethod<
  Routes,
  M
>[number]['route']
// util for finding a specific call
export type Find<
  Routes extends RouterShape,
  M extends AvailableCalls<Routes>,
  N extends RouteNamesWithMethod<Routes, M>,
> =
  FilterMethod<Routes, M> extends [infer C, ...infer Rest]
    ? C extends Call<N, M, any, any, any, any>
      ? C
      : Rest extends RouterShape
        ? Find<Rest, M, N>
        : never
    : never
export type RouteArgs<
  Routes extends RouterShape,
  M extends AvailableCalls<Routes>,
  N extends RouteNamesWithMethod<Routes, M>,
> = Find<Routes, M, N> extends Call<string, CallNames, any, infer A, any, any> ? A : never
type RouteReturn<
  Routes extends RouterShape,
  M extends AvailableCalls<Routes>,
  N extends RouteNamesWithMethod<Routes, M>,
> = Find<Routes, M, N> extends Call<string, CallNames, any, any, any, infer R2> ? R2 : never
type InvokerMap<Routes extends RouterShape> = {
  [M in AvailableCalls<Routes>]: <N extends RouteNamesWithMethod<Routes, M>>(
    name: N,
    ...args: RouteArgs<Routes, M, N>
  ) => RouteReturn<Routes, M, N>
}
// router type exposed to adapters
export type RouterAdapter<Routes extends RouterShape, RouterName extends string, CTX> = InvokerMap<Routes> & {
  context: CTX
  routeNames: RouteNames<Routes>[]
  routerName: RouterName
  methods: AvailableCalls<Routes>[]
  mappedRouter: MappedRouter<Routes>
  invoke: <CN extends AvailableCalls<Routes>, N extends RouteNamesWithMethod<Routes, CN>>(
    method: CN,
    name: N,
    args: RouteArgs<Routes, CN, N>
  ) => RouteReturn<Routes, CN, N>
  find: <CN extends AvailableCalls<Routes>, N extends RouteNamesWithMethod<Routes, CN>>(
    method: CN,
    name: N
  ) => { route: N; call: Find<Routes, CN, N> }
}
// publicly facing router type
export type Router<Routes extends RouterShape, RouterName extends string, CTX> = Omit<
  RouterAdapter<Routes, RouterName, CTX>,
  'invoke' | 'find' | 'mappedRouter'
>
/**
 * Function for creating router
 * @param context Passed context from the API
 * @returns A ready to use router-adapter
 */
export function router<const CTX extends Obj>(context: CTX) {
  return <const RouterName extends string, const Routes extends RouterShape>(
    routerName: RouterName,
    ...routes: Routes
  ) => {
    const routeNames: RouteNames<Routes>[] = []
    const methods: AvailableCalls<Routes>[] = []
    const mappedRouter = {} as MappedRouter<Routes>
    // we use a for const for a single iteration (faster than multiple maps/filters)
    for (const route of routes) {
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
    const invoke = <CN extends AvailableCalls<Routes>, N extends RouteNamesWithMethod<Routes, CN>>(
      method: CN,
      name: N,
      args: RouteArgs<Routes, CN, N>
    ): RouteReturn<Routes, CN, N> => {
      const { route, call } = find(method, name)
      if (call.resolver) {
        // @ts-expect-error by object definition, key can potentially be a | number | symbol, but
        // we always treat them as string
        const ctx: CTX & Context<CN, RouteArgs<Routes, CN, N>, N, RouterName> = {
          ...context,
          routerName,
          route,
          args,
          type: call.method === 'call' ? 'procedure' : 'request',
          method,
        }
        return call.resolver(call.fn(...args), ctx)
      }
      return call.fn(...args)
    }

    /**
     * User facing API for calling procedures
     * @param name name of the procedure
     * @param args arguments to pass to the procedure
     * @returns Return type of the procedure
     */
    const call = <N extends RouteNamesWithMethod<Routes, 'call'>>(
      name: N,
      ...args: RouteArgs<Routes, 'call', N>
    ): RouteReturn<Routes, 'call', N> => {
      return invoke('call', name, args)
    }

    /**
     * internal API for calling requests (user is exposed individual methods @see invokerMap)
     * @param method method of the request
     * @param name name of the request
     * @param args arguments to pass to the request
     * @returns Return type of the request
     */
    const request =
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
        [method]: method === 'call' ? call : request(method),
      }),
      {} as InvokerMap<Routes>
    )

    return {
      ...invokerMap,
      context,
      routeNames,
      routerName,
      methods,
      mappedRouter,
      invoke, // <- these 2 will be removed in the user-facing API
      find, // <- these 2 will be removed in the user-facing API
      // have to type-cast like this, because the shape can never know from typescript
      // which types are available before routes with call and methods are passed
    } as unknown as RouterAdapter<Routes, RouterName, CTX>
  }
}
