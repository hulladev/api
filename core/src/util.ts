import type { LowercaseMethods } from './constants'
import type { TypedRequestConfig } from './request'
import type { Obj } from './types'

export function entries<T extends Obj>(obj: T): [keyof T, T[keyof T]][] {
  return Object.entries(obj) as [keyof T, T[keyof T]][]
}

export function values<T extends Obj>(obj: T): T[keyof T][] {
  return Object.values(obj) as T[keyof T][]
}

export function keys<T extends Obj>(obj: T): (keyof T)[] {
  return Object.keys(obj) as (keyof T)[]
}

export function assign<T extends Obj, U extends Obj>(obj: T, ...sources: U[]): T & U {
  return Object.assign(obj, ...sources)
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

type URLType = InstanceType<typeof URL>

export function isURL(value: URLType | TypedRequestConfig<LowercaseMethods, unknown, unknown>): value is URLType {
  return value instanceof URL
}