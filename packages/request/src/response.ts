import type { Args, Context } from '@hulla/api'
import type { LowercaseMethods, Methods, TypedRequestConfig } from './types'
import { isURL } from './utils'

export function parseUrl(req: TypedRequestConfig<LowercaseMethods, unknown, unknown> | URL | string | Request): URL {
  return typeof req === 'string' ? new URL(req) : isURL(req as URL) ? (req as URL) : new URL((req as Request).url)
}

export function parseBody(
  req: TypedRequestConfig<LowercaseMethods | Methods, unknown, unknown> | URL | string | Request
): RequestInit['body'] {
  const data = (req as TypedRequestConfig<LowercaseMethods, unknown, unknown>).data
  return (req as Request).body
    ? (req as Request).body
    : (req as TypedRequestConfig<LowercaseMethods, unknown, unknown>).data
      ? typeof data === 'string'
        ? data
        : JSON.stringify(data)
      : undefined
}

export function parseRequest<M extends LowercaseMethods>(
  req: TypedRequestConfig<LowercaseMethods | Methods, unknown, unknown> | URL | string | Request,
  url: URL,
  body: RequestInit['body'],
  ctx: Context<string, M, Args, string>
) {
  const reqObj = typeof req === 'string' || isURL(req as URL) ? { method: ctx.method } : { method: ctx.method, ...req }
  return { ...reqObj, url, ...(body === undefined ? {} : { body }) }
}

export function response<
  M extends LowercaseMethods | Methods,
  D,
  P,
  RQ extends TypedRequestConfig<M, D, P> | URL | string | Request,
  R2 = Promise<Response>,
>(req: RQ, ctx: Context<string, Lowercase<M>, Args, string>): R2 {
  const url: URL = parseUrl(req)
  const body = parseBody(req)
  const init = parseRequest(req, url, body, ctx)
  return fetch(url, init) as R2
}
