import type { AvailableCalls, Obj, RouteArgs, RouteNamesWithMethod, RouterAdapter, RouterShape } from '@/core/src/types'
import { keys } from './query'

type ReverseTuple<T extends readonly unknown[], R extends any[] = []> = T extends readonly [infer Head, ...infer Tail]
  ? ReverseTuple<Tail, [Head, ...R]>
  : R

export type QueryKey<T extends readonly unknown[]> =
  ReverseTuple<T> extends readonly [_, ...infer Rest] ? T | QueryKey<ReverseTuple<Rest>> : []

export function encodeKey<const M extends string, const RN extends string, const N extends string>(
  method: M,
  router: RN,
  name: N
) {
  return `${method}/${router}/${name}` as const
}

export type KeyMapping<Routes extends RouterShape, RN extends string> = {
  [M in AvailableCalls<Routes>]: <
    const N extends RouteNamesWithMethod<Routes, M>,
    const RA extends RouteArgs<Routes, M, N>,
  >(
    route: N,
    ...args: RA
  ) => readonly [`${M}/${RN}/${N}`, ...RA]
}

export function queryKey<const Routes extends RouterShape, const RN extends string, const AD extends Obj>(
  router: RouterAdapter<Routes, RN, AD>
) {
  return keys(router.mappedRouter).reduce(
    (acc, method) => {
      acc[method] = <
        const N extends RouteNamesWithMethod<Routes, typeof method>,
        A extends RouteArgs<Routes, typeof method, N>,
      >(
        route: N,
        ...args: A
      ) => [encodeKey(method, router.routerName, route), ...args] as const
      return acc
    },
    {} as KeyMapping<Routes, RN>
  )
}
