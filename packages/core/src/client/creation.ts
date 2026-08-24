import type { CompiledContractRoute } from '../compiler'
import type { CompositionScope } from '../composition'

export type ClientRouteBinding = {
  readonly call: (...args: readonly unknown[]) => Promise<unknown>
  readonly compiled: CompiledContractRoute
}

export type ClientScope = CompositionScope
