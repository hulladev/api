import type { Router, RouterAdapter, RouterShape } from './router'
import type { Fn, Obj } from './types'
import { entries, omit } from './util'

export type Adapters<Routes extends RouterShape, RN extends string, CTX extends Obj> = Record<
  string,
  (router: RouterAdapter<Routes, RN, CTX>) => any
>

export type AdapterMap<
  Routes extends RouterShape,
  RN extends string,
  CTX extends Obj,
  AD extends Adapters<Routes, RN, CTX>,
> = {
  [K in keyof AD]: AD[K] extends Fn<any, infer R> ? R : never
}

export type API<
  Routes extends RouterShape,
  N extends string,
  CTX extends Obj,
  AD extends Adapters<Routes, N, CTX>,
> = Router<Routes, N, CTX> & AdapterMap<Routes, N, CTX, AD>

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
  const AD extends Adapters<Routes, RN, CTX>,
>(router: RouterAdapter<Routes, RN, CTX>, adapters?: AD): API<Routes, RN, CTX, AD> {
  if (adapters) {
    return omit(
      {
        ...router,
        ...entries(adapters).reduce(
          (acc, [adapterName, adapterVal]) => ({
            ...acc,
            [adapterName]: adapterVal(router),
          }),
          {} as AdapterMap<Routes, RN, CTX, AD>
        ),
      },
      'find',
      'invoke',
      'mappedRouter'
    ) as API<Routes, RN, CTX, AD>
  }
  return omit(router, 'find', 'invoke') as API<Routes, RN, CTX, AD>
}
