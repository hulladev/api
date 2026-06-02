export type ProcedureKey<A extends readonly unknown[] = readonly unknown[]> = readonly [string, ...A]

export type SWROptions<A extends readonly unknown[] = readonly unknown[], R = unknown> = readonly [
  ProcedureKey<A>,
  () => R,
]
