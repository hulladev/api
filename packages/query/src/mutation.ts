import type { Obj, RouterAdapter, RouterShape } from '@hulla/api'
import { encodeKey as defaultEncodeMutationKey } from './keys'
import { createMapping } from './query'

export function mutation<Routes extends RouterShape, RN extends string, AD extends Obj>(
  router: RouterAdapter<Routes, RN, AD>,
  encodeMutationKey: typeof defaultEncodeMutationKey = defaultEncodeMutationKey
) {
  return createMapping(router, encodeMutationKey, 'mutationKey', 'mutationFn')
}
