import type { AvailableCalls, RouteArgs, RouteNamesWithMethod, RouteReturn, RouterShape } from '@hulla/api'

/* ------------------------------- query keys ------------------------------- */
type ReverseTuple<T extends readonly unknown[], R extends any[] = []> = T extends readonly [infer Head, ...infer Tail]
  ? ReverseTuple<Tail, [Head, ...R]>
  : R

export type QueryKey<T extends readonly unknown[]> =
  // eslint-disable-next-line @typescript-eslint/no-unused-vars
  ReverseTuple<T> extends readonly [infer _, ...infer Rest] ? T | QueryKey<ReverseTuple<Rest>> : []

export type KeyMapping<Routes extends RouterShape, RN extends string> = {
  [M in AvailableCalls<Routes>]: <
    const N extends RouteNamesWithMethod<Routes, M>,
    const RA extends QueryKey<RouteArgs<Routes, M, N>>,
  >(
    route: N,
    ...args: RA
  ) => readonly [`${M}/${RN}/${N}`, ...RA]
}

/* -------------------------- queries and mutations ------------------------- */
export type Options<
  Routes extends RouterShape,
  RN extends string,
  M extends AvailableCalls<Routes>,
  N extends RouteNamesWithMethod<Routes, M>,
  A extends RouteArgs<Routes, M, N>,
  QK extends string,
  QF extends string,
> = {
  [K in QK | QF]: K extends QK
    ? readonly [`${M}/${RN}/${N}`, ...A]
    : K extends QF
      ? () => RouteReturn<Routes, M, N>
      : never
}

export type Mapping<Routes extends RouterShape, RN extends string, QK extends string, QF extends string> = {
  [M in AvailableCalls<Routes>]: <const N extends RouteNamesWithMethod<Routes, M>, RA extends RouteArgs<Routes, M, N>>(
    route: N,
    ...args: RA
  ) => Options<Routes, RN, M, N, RA, QK, QF>
}
