import type { Obj } from './types'

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
