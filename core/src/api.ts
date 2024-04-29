import { RESERVED_CONTEXT } from './constants'
import { create } from './create'
import { procedure } from './procedure'
import { request } from './request'
import { router } from './router'
import type { Obj } from './types'
import { keys } from './util'

/**
 * extends the api SDK with a context object
 * @param context context that will be availabe in all calls
 * @docs http://hulla.dev/docs/api/context
 * @returns
 */
function context<const CTX extends Obj>(context: CTX) {
  for (const key of keys(context)) {
    if (RESERVED_CONTEXT.includes(key as (typeof RESERVED_CONTEXT)[number])) {
      throw new Error(
        `${key as string} is a reserved context keyword that will be overriden by router. See https://hulla.dev/docs/api/context`
      )
    }
  }
  // this returns a new API SDK instance enriched with context (that no longer allows another .context call)
  return {
    procedure: procedure<CTX>(),
    request: request<CTX>(),
    router: router<CTX>(context),
    create: create,
  }
}

export type NoContext = Record<string, never>

/**
 * api SDK
 * @docs https://hulla.dev/docs/api
 * @example
 * // a pseudocall, can be any function
 * const yourGetter = (id: string) => db.users.find(id)
 * // define your router
 * const router = api.router({
 *   name: 'users',
 *   routes: {
 *     getUserById: api.procedure(yourGetter)
 *     // ...
 *   }
 * })
 * // create and export your API for further use
 * export const usersAPI = api.create(router)
 */
export const api = {
  // uses {} as default context (unspecified)
  procedure: procedure<NoContext>(),
  request: request<NoContext>(),
  router: router<NoContext>({} as NoContext),
  context,
  create,
}
