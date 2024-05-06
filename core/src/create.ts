import type { API, AdapterMap, Adapters, Obj, RouterAdapter, RouterShape } from './types'
import { entries, omit } from './util'

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
