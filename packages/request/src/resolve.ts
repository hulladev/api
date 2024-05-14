import type { Args, Context } from '@hulla/api'
import { response } from './response'
import type { Callables, LowercaseMethods, Methods, TypedRequestConfig } from './types'

export function resolve<
  R,
  Req extends TypedRequestConfig<LowercaseMethods | Methods> | string | URL =
    | TypedRequestConfig<LowercaseMethods | Methods>
    | string
    | URL,
  T extends Callables<Response> = 'json',
>(req: Req, ctx: Context<string, LowercaseMethods, Args, string>, transformer?: T) {
  return response(req, ctx).then((res) => res[transformer ?? 'json']()) as R
}
