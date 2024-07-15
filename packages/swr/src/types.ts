import type { Methods, RouteArgs, RouteNamesWithMethod, RouteReturn, Routes } from '@hulla/api'

export type Options<
  R extends Routes,
  RN extends string,
  M extends Methods<R>,
  N extends RouteNamesWithMethod<R, M>,
  A extends RouteArgs<R, M, N>,
> = readonly [
  [`${M extends string ? M : never}/${RN}/${N extends string ? N : never}`, ...A],
  () => RouteReturn<R, M, N>,
]

export type Mapping<R extends Routes, RN extends string> = {
  [M in Methods<R>]: <const N extends RouteNamesWithMethod<R, M>, RA extends RouteArgs<R, M, N>>(
    route: N,
    ...args: RA
  ) => Options<R, RN, M, N, RA>
}
