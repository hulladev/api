import type { Obj, RouteArgs, RouteNamesWithMethod, RouterAdapter, RouterShape } from '../../core/src/types'
import type { KeyMapping, QueryKey } from './types'
import { keys } from './utils'

export function encodeKey<const M extends string, const RN extends string, const N extends string>(
  method: M,
  router: RN,
  name: N
) {
  return `${method}/${router}/${name}` as const
}

export function queryKey<const Routes extends RouterShape, const RN extends string, const AD extends Obj>(
  router: RouterAdapter<Routes, RN, AD>
) {
  return keys(router.mappedRouter).reduce(
    (acc, method) => {
      acc[method] = <
        const N extends RouteNamesWithMethod<Routes, typeof method>,
        const A extends QueryKey<RouteArgs<Routes, typeof method, N>>,
      >(
        route: N,
        ...args: A
      ) => [encodeKey(method, router.routerName, route), ...args] as const
      return acc
    },
    {} as KeyMapping<Routes, RN>
  )
}
