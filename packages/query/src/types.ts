import type { Methods, RouteArgs, RouteNamesWithMethod, RouteReturn, Routes } from '@hulla/api'

/* ------------------------------- query keys ------------------------------- */
type ReverseTuple<T extends readonly unknown[], R extends any[] = []> = T extends readonly [infer Head, ...infer Tail]
  ? ReverseTuple<Tail, [Head, ...R]>
  : R

export type QueryKey<T extends readonly unknown[]> =
  // eslint-disable-next-line @typescript-eslint/no-unused-vars
  ReverseTuple<T> extends readonly [infer _, ...infer Rest] ? T | QueryKey<ReverseTuple<Rest>> : []

export type KeyMapping<R extends Routes, RN extends string> = {
  [M in Methods<R>]: <const N extends RouteNamesWithMethod<R, M>, const RA extends QueryKey<RouteArgs<R, M, N>>>(
    route: N,
    ...args: RA
  ) => readonly [`${M extends string ? M : never}/${RN}/${N extends string ? N : never}`, ...RA]
}

/* -------------------------- queries and mutations ------------------------- */
export type Options<
  R extends Routes,
  RN extends string,
  M extends Methods<R>,
  N extends RouteNamesWithMethod<R, M>,
  A extends RouteArgs<R, M, N>,
  QK extends string,
  QF extends string,
> = {
  [K in QK | QF]: K extends QK
    ? readonly [`${M extends string ? M : never}/${RN}/${N extends string ? N : never}`, ...A]
    : K extends QF
      ? () => RouteReturn<R, M, N>
      : never
}

export type Mapping<R extends Routes, RN extends string, QK extends string, QF extends string> = {
  [M in Methods<R>]: <const N extends RouteNamesWithMethod<R, M>, RA extends RouteArgs<R, M, N>>(
    route: N,
    ...args: RA
  ) => Options<R, RN, M, N, RA, QK, QF>
}
