import { procedure } from './procedure'
import { router } from './router'
import type { APIConfig, APISDK, CustomMethods, MappedCM, Obj } from './types'

/**
 * api SDK
 * @docs https://hulla.dev/docs/api
 * @example
 * // initialize your api
 * const a = api()
 * // a pseudocall, can be any function
 * const yourGetter = (id: string) => db.users.find(id)
 * // define your router
 * export const usersAPI = a.router({
 *   name: 'users',
 *   routes: [
 *     a.procedure('getUserById', yourGetter)
 *     // ...
 *   ]
 * })
 * */
export function api<const CTX extends Obj = Record<string, never>, const CM extends CustomMethods = CustomMethods>(
  config?: APIConfig<CTX, CM>
): APISDK<CTX, CM> {
  const context = config?.context ?? ({} as CTX)
  return {
    ...((config?.methods?.(context) ?? {}) as MappedCM<CM>),
    router: router<CTX>(context),
    procedure: procedure<CTX>(),
  }
}
