import type { Args, Context, Obj } from '@hulla/api'
import type { LowercaseMethods, Methods, TypedRequestConfig, URICompoent } from './types'
import { isRequest, isURL } from './utils'

export function addParams<const U extends string>(
  req: TypedRequestConfig<LowercaseMethods | Methods, U> & { params?: Record<string, URICompoent> }
) {
  let url = req.url as string
  // params may not alwayas be passed (or even need to be passed)
  const params = req.params ?? {}
  // Replace any placeholders in the URL with corresponding parameter values
  for (const key in params) {
    url = url.replace(new RegExp(':' + key, 'g'), encodeURIComponent(params[key]))
    url = url.replace(new RegExp('\\?' + key, 'g'), `?${key}=${encodeURIComponent(params[key])}`)
    url = url.replace(new RegExp('&' + key, 'g'), `&${key}=${encodeURIComponent(params[key])}`)
  }
  return url
}

export function parseUrl<CTX extends Obj>(
  req: TypedRequestConfig<LowercaseMethods | Methods> | URL | string | Request,
  // @ts-expect-error TS cannot know {} matches CTX, but for our purposes of fallback if not defined it's good enough
  context: CTX = {}
): URL {
  const baseURL = context['baseURL'] ?? ''
  // passed only string
  if (typeof req === 'string') {
    return new URL(`${baseURL}${req}`)
  }
  // passed as URL
  if (isURL(req)) {
    return req as URL
  }
  // passed as Request
  if (isRequest(req)) {
    return new URL(req.url)
  }
  // otherwise must be a TypedRequestConfig
  const url = addParams(req)
  return new URL(`${baseURL}${url}`)
}

export function parseBody(
  req: TypedRequestConfig<LowercaseMethods | Methods> | URL | string | Request
): RequestInit['body'] {
  const data = (req as TypedRequestConfig<LowercaseMethods>).data
  return (req as Request).body
    ? (req as Request).body
    : (req as TypedRequestConfig<LowercaseMethods>).data
      ? typeof data === 'string'
        ? data
        : JSON.stringify(data)
      : undefined
}

export function parseRequest<M extends LowercaseMethods>(
  req: TypedRequestConfig<LowercaseMethods | Methods> | URL | string | Request,
  url: URL,
  body: RequestInit['body'],
  ctx: Context<string, M, Args, string>
) {
  const reqObj = typeof req === 'string' || isURL(req as URL) ? { method: ctx.method } : { method: ctx.method, ...req }
  return { ...reqObj, url, ...(body === undefined ? {} : { body }) }
}

export function response<
  M extends LowercaseMethods | Methods,
  RQ extends TypedRequestConfig<M> | URL | string | Request,
  R2 = Promise<Response>,
>(req: RQ, ctx: Context<string, Lowercase<M>, Args, string>): R2 {
  const url: URL = parseUrl(req, ctx)
  const body = parseBody(req)
  const init = parseRequest(req, url, body, ctx)
  return fetch(url, init) as R2
}
