import type {
  AsyncMiddleware,
  Context,
  MergeContext,
  MergedMiddlewareFn,
  Middleware,
  ResolvedMiddleware,
  SyncMiddleware,
} from '../types'

function isPromiseLike(value: Context | Promise<Context>): value is Promise<Context> {
  return typeof (value as Promise<Context>)?.then === 'function'
}

function isAsyncMiddleware(middleware: Middleware): middleware is AsyncMiddleware {
  return Object.prototype.toString.call(middleware) === '[object AsyncFunction]'
}

export function createMiddleware<P extends Middleware, G extends Middleware>(
  apiMiddleware: ResolvedMiddleware<P>,
  groupMiddleware: ResolvedMiddleware<G>
): MergedMiddlewareFn<P, G>
export function createMiddleware(): undefined
export function createMiddleware<G extends Context>(apiMiddleware: undefined, groupMiddleware: SyncMiddleware<G>): SyncMiddleware<G>
export function createMiddleware<G extends Context>(apiMiddleware: undefined, groupMiddleware: AsyncMiddleware<G>): AsyncMiddleware<G>
export function createMiddleware<P extends Context>(apiMiddleware: SyncMiddleware<P>, groupMiddleware: undefined): SyncMiddleware<P>
export function createMiddleware<P extends Context>(apiMiddleware: AsyncMiddleware<P>, groupMiddleware: undefined): AsyncMiddleware<P>
export function createMiddleware<P extends Context, G extends Context>(
  apiMiddleware: SyncMiddleware<P>,
  groupMiddleware: SyncMiddleware<G>
): SyncMiddleware<MergeContext<P, G>>
export function createMiddleware<P extends Context, G extends Context>(
  apiMiddleware: SyncMiddleware<P>,
  groupMiddleware: AsyncMiddleware<G>
): AsyncMiddleware<MergeContext<P, G>>
export function createMiddleware<P extends Context, G extends Context>(
  apiMiddleware: AsyncMiddleware<P>,
  groupMiddleware: SyncMiddleware<G>
): AsyncMiddleware<MergeContext<P, G>>
export function createMiddleware<P extends Context, G extends Context>(
  apiMiddleware: AsyncMiddleware<P>,
  groupMiddleware: AsyncMiddleware<G>
): AsyncMiddleware<MergeContext<P, G>>
export function createMiddleware(
  apiMiddleware?: Middleware,
  groupMiddleware?: Middleware
): Middleware | undefined {
  if (!apiMiddleware) {
    return groupMiddleware
  }

  if (!groupMiddleware) {
    return apiMiddleware
  }

  if (isAsyncMiddleware(apiMiddleware) || isAsyncMiddleware(groupMiddleware)) {
    return async () => {
      const parentContext = apiMiddleware()
      const groupContext = groupMiddleware()

      if (isPromiseLike(parentContext) || isPromiseLike(groupContext)) {
        const [parent, group] = await Promise.all([parentContext, groupContext])
        return {
          ...parent,
          ...group,
        }
      }

      return {
        ...parentContext,
        ...groupContext,
      }
    }
  }

  return () => {
    const parentContext = apiMiddleware()
    const groupContext = groupMiddleware()

    if (isPromiseLike(parentContext) || isPromiseLike(groupContext)) {
      throw new TypeError('Synchronous middleware must not return a Promise.')
    }

    return {
      ...parentContext,
      ...groupContext,
    }
  }
}
