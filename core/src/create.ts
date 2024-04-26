import type { Router, RouterAdapter, RouterShape } from './router'
import type { Fn, Obj } from './types'
import { entries, omit } from './util'

type Adapters = Record<string, (...args: any[]) => any>

type AdapterMap<AD extends Adapters> = {
  [K in keyof AD]: AD[K] extends Fn<infer A, infer R> ? (...args: A) => R : never
}

type API<Routes extends RouterShape, N extends string, CTX extends Obj, AD extends Adapters> = Router<Routes, N, CTX> &
  AdapterMap<AD>

/**
 * Creates a new API instance
 * @param router Passed router from api.router call
 * @param adapters Optional adapters to extend the API with
 * @returns API instance for users to interact with
 */
export function create<
  const Routes extends RouterShape,
  const RN extends string,
  const CTX extends Obj,
  const AD extends Adapters,
>(router: RouterAdapter<Routes, RN, CTX>, adapters?: AD): API<Routes, RN, CTX, AD> {
  if (adapters) {
    return omit(
      {
        ...router,
        ...entries(adapters).reduce(
          (acc, [adapterName, adapterVal]) => ({
            ...acc,
            [adapterName]: adapterVal,
          }),
          {} as AdapterMap<AD>
        ),
      },
      'find',
      'invoke',
      'routerMap'
    ) as API<Routes, RN, CTX, AD>
  }
  return omit(router, 'find', 'invoke') as API<Routes, RN, CTX, AD>
}
