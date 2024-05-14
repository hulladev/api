import type { LowercaseMethods, Methods, TypedRequestConfig } from './types'

export function rq<
  const M extends LowercaseMethods | Methods,
  const U extends string,
  P extends boolean = true,
  // eslint-disable-next-line @typescript-eslint/no-unused-vars
>(config: TypedRequestConfig<M, U, P> & { method: M }) {
  return config
}
