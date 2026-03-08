import type { Adapters, Obj, RouterAdapter, Routes } from '@hulla/api'
import { encodeKey as defaultEncodeMutationKey } from './keys'
import { createMapping } from './query'

export function mutation<
  R extends Routes,
  RN extends string,
  CTX extends Obj,
  const PK extends string,
  AD extends Adapters<CTX, PK, R, RN>,
>(
  router: RouterAdapter<R, RN, CTX, PK, AD>,
  encodeMutationKey: typeof defaultEncodeMutationKey = defaultEncodeMutationKey
) {
  return createMapping(router, encodeMutationKey, 'mutationKey', 'mutationFn')
}
