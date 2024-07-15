import type { Adapters, Obj, RouterAdapter, Routes } from '@hulla/api'
import { encodeKey as defaultEncodeMutationKey } from './keys'
import { createMapping } from './swr'

export function mutation<
  const R extends Routes,
  const RN extends string,
  const CTX extends Obj,
  const PK extends string,
  AD extends Adapters<CTX, PK, R, RN>,
>(
  router: RouterAdapter<R, RN, CTX, PK, AD>,
  encodeMutationKey: typeof defaultEncodeMutationKey = defaultEncodeMutationKey
) {
  return createMapping(router, encodeMutationKey)
}
