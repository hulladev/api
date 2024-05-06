import { response } from './response'
import type { Args, Context, LowercaseMethods, Methods, TypedRequestConfig } from './types'

export function resolve<
  R,
  Req extends TypedRequestConfig<LowercaseMethods | Methods> | string | URL =
    | TypedRequestConfig<LowercaseMethods | Methods>
    | string
    | URL,
>(req: Req, ctx: Context<string, LowercaseMethods, Args, string>) {
  return response(req, ctx).then((res) => res.json()) as R
}
