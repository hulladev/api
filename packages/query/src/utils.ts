import type { Obj } from '../../core/src/types'

export function keys<T extends Obj>(obj: T): (keyof T)[] {
  return Object.keys(obj) as (keyof T)[]
}
