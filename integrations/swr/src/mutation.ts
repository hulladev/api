import type { AvailableCalls, Obj, RouteArgs, RouteNamesWithMethod, RouterAdapter, RouterShape } from '@hulla/api'
import { encodeKey as defaultEncodeMutationKey } from './keys'
import { swr } from './swr'

export function mutation<Routes extends RouterShape, RN extends string, AD extends Obj>(
  router: RouterAdapter<Routes, RN, AD>,
  encodeMutationKey: typeof defaultEncodeMutationKey = defaultEncodeMutationKey
) {
  return <M extends AvailableCalls<Routes>, N extends RouteNamesWithMethod<Routes, M>>(
    method: M,
    name: N,
    ...args: RouteArgs<Routes, M, N>
  ) => {
    // the query function is the same as the mutation function, with just different keys
    const [mutationKey, mutationFn] = swr(router, encodeMutationKey)(method, name, ...args)
    return [mutationKey, mutationFn]
  }
}
