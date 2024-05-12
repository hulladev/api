import type {
  AvailableCalls,
  Obj,
  RouteArgs,
  RouteNamesWithMethod,
  RouterAdapter,
  RouterShape,
} from '../../core/src/types'
import { encodeKey } from './keys'
import type { Mapping } from './types'
import { keys } from './utils'

export function createMapping<const Routes extends RouterShape, const RN extends string, const CTX extends Obj>(
  router: RouterAdapter<Routes, RN, CTX>,
  encodeQueryKey: typeof encodeKey
) {
  const createQuery =
    <const M extends AvailableCalls<Routes>>(method: M) =>
    <const N extends RouteNamesWithMethod<Routes, M>, const A extends RouteArgs<Routes, M, N>>(
      route: N,
      ...args: A
    ) => {
      const encodedName = encodeQueryKey<M, RN, N>(method, router.routerName, route)
      const queryKey = [encodedName, ...args] as const
      // we don't care if we potentially pass an extra (options) argument here, as it just gets consumed and gc dropped
      const queryFn = () => router.invoke(method, route, args as unknown as RouteArgs<Routes, M, N>)
      return [queryKey, queryFn]
    }
  return keys(router.mappedRouter).reduce(
    (acc, method) => {
      // @ts-expect-error dynamic mapping - ts cannot know which call will be available
      acc[method] = createQuery(method)
      return acc
    },
    {} as Mapping<Routes, RN>
  )
}

export function swr<const Routes extends RouterShape, const RN extends string, CTX extends Obj>(
  router: RouterAdapter<Routes, RN, CTX>,
  encodeQueryKey: typeof encodeKey = encodeKey
) {
  return createMapping(router, encodeQueryKey)
}
