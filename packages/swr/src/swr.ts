import type { Adapters, Methods, Obj, RouteArgs, RouteNamesWithMethod, RouterAdapter, Routes } from '@hulla/api'
import { encodeKey } from './keys'
import type { Mapping } from './types'
import { keys } from './utils'

export function createMapping<
  const R extends Routes,
  const RN extends string,
  const CTX extends Obj,
  const PK extends string,
  AD extends Adapters<CTX, PK, R, RN>,
>(router: RouterAdapter<R, RN, CTX, PK, AD>, encodeQueryKey: typeof encodeKey) {
  const createQuery =
    <const M extends Methods<R>>(method: M) =>
    <const N extends RouteNamesWithMethod<R, M>, const A extends RouteArgs<R, M, N>>(route: N, ...args: A) => {
      const encodedName = encodeQueryKey<M extends string ? M : never, RN, N extends string ? N : never>(
        method as M extends string ? M : never,
        router.name,
        route as N extends string ? N : never
      )
      const queryKey = [encodedName, ...args] as const
      // we don't care if we potentially pass an extra (options) argument here, as it just gets consumed and gc dropped
      const queryFn = () => router.invoke(method, route, ...args)
      return [queryKey, queryFn]
    }
  return keys(router.routerMap).reduce(
    (acc, method) => {
      // @ts-expect-error dynamic mapping - ts cannot know which call will be available
      acc[method] = createQuery(method)
      return acc
    },
    {} as Mapping<R, RN>
  )
}

export function swr<
  const R extends Routes,
  const RN extends string,
  CTX extends Obj,
  const PK extends string,
  AD extends Adapters<CTX, PK, R, RN>,
>(router: RouterAdapter<R, RN, CTX, PK, AD>, encodeQueryKey: typeof encodeKey = encodeKey) {
  return createMapping(router, encodeQueryKey)
}
