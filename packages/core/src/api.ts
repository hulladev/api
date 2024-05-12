import { create } from './create'
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
 * const router = a.router({
 *   name: 'users',
 *   routes: {
 *     getUserById: a.procedure(yourGetter)
 *     // ...
 *   }
 * })
 * // create and export your API for further use
 * export const usersAPI = a.create(router)
 * */
export function api<const CTX extends Obj = Record<string, never>, const CM extends CustomMethods = CustomMethods>(
  config?: APIConfig<CTX, CM>
): APISDK<CTX, CM> {
  const context = config?.context ?? ({} as CTX)
  return {
    ...((config?.methods?.(context) ?? {}) as MappedCM<CM>),
    router: router<CTX>(context),
    procedure: procedure<CTX>(),
    create: create,
  }
}
