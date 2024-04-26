import type { Context } from './call'
import type { LowercaseMethods } from './constants'
import type { TypedRequestConfig } from './request'
import { response } from './response'
import type { Args, Methods } from './types'

export function resolve<
  R,
  Req extends TypedRequestConfig<LowercaseMethods | Methods> | string | URL =
    | TypedRequestConfig<LowercaseMethods | Methods>
    | string
    | URL,
>(req: Req, ctx: Context<string, LowercaseMethods, Args, string>) {
  return response(req, ctx).then((res) => res.json()) as R
}
