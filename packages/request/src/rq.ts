import type { LowercaseMethods, Methods, TypedRequestConfig } from './types'

export function rq<
  const M extends LowercaseMethods | Methods,
  const U extends string,
  P extends 'parse' | 'manual' = 'parse',
  // eslint-disable-next-line @typescript-eslint/no-unused-vars
>(config: TypedRequestConfig<M, U, P> & { method: M; paramsMode?: P }) {
  return config
}
