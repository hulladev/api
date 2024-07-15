import type { Adapters, Obj, RouteArgs, RouteNamesWithMethod, RouterAdapter, Routes } from '@hulla/api'
import type { KeyMapping, QueryKey } from './types'
import { keys } from './utils'

export function encodeKey<const M extends string, const RN extends string, const N extends string>(
  method: M,
  router: RN,
  name: N
) {
  return `${method}/${router}/${name}` as const
}

export function queryKey<
  const R extends Routes,
  const RN extends string,
  CTX extends Obj,
  const PK extends string,
  const AD extends Adapters<CTX, PK, R, RN>,
>(router: RouterAdapter<R, RN, CTX, PK, AD>) {
  return keys(router.routerMap).reduce(
    (acc, method) => {
      // @ts-expect-error dynamic mapping
      acc[method] = <
        const N extends RouteNamesWithMethod<R, typeof method>,
        const A extends QueryKey<RouteArgs<R, typeof method, N>>,
      >(
        route: N,
        ...args: A
      ) => [encodeKey(method as string, router.name, route as string), ...args] as const
      return acc
    },
    {} as KeyMapping<R, RN>
  )
}
