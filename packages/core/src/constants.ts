import type { APISDK, AdapterProperties, ContextWithResult } from './types'

export const RESERVED_CONTEXT = [
  'route',
  'method',
  'args',
  'type',
  'routerName',
  'result',
] as const satisfies (keyof ContextWithResult<any, string, any, any>)[]

export const RESERVED_KEYWORDS = ['call', 'procedure', 'create'] as const satisfies (keyof APISDK<never, never>)[]

export const ADAPTER_PROPERTIES = ['mappedRouter', 'find', 'invoke'] as const satisfies Array<AdapterProperties>
