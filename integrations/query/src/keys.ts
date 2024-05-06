import type { AvailableCalls, Obj, RouteArgs, RouteNamesWithMethod, RouterAdapter, RouterShape } from '@/core/src/types'

type TupleVariants<T extends readonly unknown[], U extends readonly unknown[] = []> = T extends readonly [
  infer Head,
  ...infer Tail,
]
  ? Tail extends readonly unknown[]
    ? // if u pass the head first, it will be infinitely deep (ts error)
      // hence we do this and then reverse the tuple order
      [Head, ...U] | TupleVariants<Tail, [Head, ...U]>
    : never
  : []
type ReverseTuple<T extends any[], R extends any[] = []> = T extends readonly [infer Head, ...infer Tail]
  ? ReverseTuple<Tail, [Head, ...R]>
  : R

export type QueryKey<T extends readonly unknown[]> = ReverseTuple<TupleVariants<T>, []>

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
    const A extends QueryKey<RouteArgs<Routes, M, N>>,
  >(
    method: M,
    name: N,
    ...args: A
  ) => [encodeQueryKey(method, router.routerName, name), ...args] as const
}
