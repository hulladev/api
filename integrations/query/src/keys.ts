import type { AvailableCalls, Obj, RouteArgs, RouteNamesWithMethod, RouterAdapter, RouterShape } from '@/core/src/types'

export function encodeKey<const M extends string, const RN extends string, const N extends string>(
  method: M,
  router: RN,
  name: N
) {
  return `${method}/${router}/${name}` as const
}

export function queryKey<const Routes extends RouterShape, const RN extends string, AD extends Obj>(
  router: RouterAdapter<Routes, RN, AD>,
  encodeQueryKey = encodeKey
) {
  return <
    const M extends AvailableCalls<Routes>,
    const N extends RouteNamesWithMethod<Routes, M>,
    const A extends RouteArgs<Routes, M, N>,
  >(
    method: M,
    name: N,
    ...args: A
  ) => [encodeQueryKey(method, router.routerName, name), ...args] as const
}
