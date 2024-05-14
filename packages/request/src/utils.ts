import type { Methods } from '@hulla/api'
import type { LowercaseMethods, TypedRequestConfig, URLType } from './types'

export function isURL(
  value: TypedRequestConfig<LowercaseMethods | Methods> | string | URL | Request
): value is URLType {
  return value instanceof URL
}

export function isRequest(
  value: TypedRequestConfig<LowercaseMethods | Methods> | URL | string | Request
): value is Request {
  return value instanceof Request
}
