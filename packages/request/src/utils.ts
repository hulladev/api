import type { LowercaseMethods, TypedRequestConfig, URLType } from './types'

export function isURL(value: URLType | TypedRequestConfig<LowercaseMethods, unknown, unknown>): value is URLType {
  return value instanceof URL
}
