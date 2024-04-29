// TODO: Replace with @hulla/api after first release
import type {
  AvailableCalls,
  RouteArgs,
  RouteNamesWithMethod,
  RouterAdapter,
  RouterShape,
} from '../../../core/src/router'
import type { Obj } from '../../../core/src/types'
import { encodeKey } from './keys'

export function query<const Routes extends RouterShape, const RN extends string, CTX extends Obj>(
  router: RouterAdapter<Routes, RN, CTX>,
  encodeQueryKey: typeof encodeKey = encodeKey
) {
  return <
    const M extends AvailableCalls<Routes>,
    const N extends RouteNamesWithMethod<Routes, M>,
    RA extends RouteArgs<Routes, M, N>,
  >(
    method: M,
    name: N,
    ...args: RA
  ) => {
    const encodedName = encodeQueryKey<M, RN, N>(method, router.routerName, name)
    const queryKey = [encodedName, ...args] as const
    // we don't care if we potentially pass an extra (options) argument here, as it just gets consumed and gc dropped
    const queryFn = () => router.invoke(method, name, args as unknown as RouteArgs<Routes, M, N>)
    return {
      queryKey,
      queryFn,
    }
  }
}