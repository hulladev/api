import type { AvailableCalls, Obj, RouteArgs, RouteNamesWithMethod, RouterAdapter, RouterShape } from '@/core/src/types'
import { encodeKey as defaultEncodeMutationKey } from './keys'
import { query } from './query'

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
    const { queryFn, queryKey } = query(router, encodeMutationKey)(method, name, ...args)
    return {
      mutationFn: queryFn,
      mutationKey: queryKey,
    }
  }
}
