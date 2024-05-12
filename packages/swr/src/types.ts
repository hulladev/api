import type { AvailableCalls, RouteArgs, RouteNamesWithMethod, RouteReturn, RouterShape } from '@hulla/api'

export type Options<
  Routes extends RouterShape,
  RN extends string,
  M extends AvailableCalls<Routes>,
  N extends RouteNamesWithMethod<Routes, M>,
  A extends RouteArgs<Routes, M, N>,
> = readonly [[`${M}/${RN}/${N}`, ...A], () => RouteReturn<Routes, M, N>]

export type Mapping<Routes extends RouterShape, RN extends string> = {
  [M in AvailableCalls<Routes>]: <const N extends RouteNamesWithMethod<Routes, M>, RA extends RouteArgs<Routes, M, N>>(
    route: N,
    ...args: RA
  ) => Options<Routes, RN, M, N, RA>
}
