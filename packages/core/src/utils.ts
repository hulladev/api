import type { Args, Call, Context, Obj } from './types'

export function entries<T extends Obj>(obj: T): [keyof T, T[keyof T]][] {
  return Object.entries(obj) as [keyof T, T[keyof T]][]
}

export function keys<T extends Obj>(obj: T): (keyof T)[] {
  return Object.keys(obj) as (keyof T)[]
}

export function omit<T extends Obj, Omitted extends (keyof T)[]>(obj: T, ...omittedKeys: Omitted) {
  return keys(obj).reduce(
    (res, key) => {
      if (omittedKeys.includes(key)) {
        return res
      }
      return {
        ...res,
        [key]: obj[key],
      }
    },
    {} as Omit<T, Omitted[number]>
  )
}

export function method<
  const M extends string,
  const N extends string,
  const CM extends string,
  CTX,
  const A extends Args,
  const R,
  const R2,
>(method: M, call: Call<N, CM, CTX, A, R, R2>) {
  type CustomCTX = CTX extends infer Custom & any ? Custom : never
  // @ts-expect-error overriding defined type method
  call['method'] = method
  return call as unknown as Call<N, M, CustomCTX & Context<N, M, A>, A, R, R2>
}
