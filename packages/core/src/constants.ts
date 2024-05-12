import type { Context } from './types'

export const RESERVED_CONTEXT = [
  'route',
  'method',
  'route',
  'args',
  'type',
  'routerName',
] as const satisfies (keyof Context<string, any, any>)[]

export const RESERVED_KEYWORDS = ['call', 'procedure', 'create'] as const
