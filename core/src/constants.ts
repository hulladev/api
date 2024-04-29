import type { Context } from './call'
import type { Methods } from './types'

export type MethodsArray = readonly Methods[]
export type LowercaseMethods = {
  [K in Methods]: Lowercase<K>
}[Methods]

export const METHODS = [
  'CONNECT',
  'DELETE',
  'GET',
  'HEAD',
  'OPTIONS',
  'PATCH',
  'POST',
  'PUT',
  'TRACE',
] satisfies MethodsArray

export const METHODS_LOWERCASE = [
  'connect',
  'delete',
  'get',
  'head',
  'options',
  'patch',
  'post',
  'put',
  'trace',
] satisfies LowercaseMethods[]

export const RESERVED_CONTEXT = [
  'route',
  'method',
  'route',
  'args',
  'type',
  'routerName',
] as const satisfies (keyof Context<string, any, any>)[]

export const RESERVED_KEYWORDS = [
  ...(METHODS.map((m) => m.toLowerCase()) as Lowercase<Methods>[]),
  'call',
  'context',
] as const
