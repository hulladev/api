import type { CompiledContractRoute } from '../compiler'
import type { CompositionScope } from '../composition'

export type ServerHandlerBinding = {
  readonly compiled: CompiledContractRoute
  readonly handler: (input: object) => unknown
  readonly middlewares: readonly unknown[]
}

export type ServerScope = CompositionScope
