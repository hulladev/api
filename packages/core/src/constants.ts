import type { APISDK, Context } from './types'

export const RESERVED_CONTEXT = ['route', 'method', 'args', 'type', 'routerName'] as const satisfies (keyof Context<
  string,
  any,
  any
>)[]

export const RESERVED_KEYWORDS = ['call', 'procedure', 'create'] as const satisfies (keyof APISDK<never, never>)[]
