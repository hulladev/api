export type ProcedureKey<A extends readonly unknown[] = readonly unknown[]> = readonly [string, ...A]

export type Options<
  QK extends string,
  QF extends string,
  A extends readonly unknown[] = readonly unknown[],
  R = unknown,
> = {
  [K in QK | QF]: K extends QK ? ProcedureKey<A> : K extends QF ? () => R : never
}
