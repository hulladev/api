import { Readable } from 'node:stream'
import type { Contract } from '@hulla/api'
import { createNodeBodyReader, nodeRequestHeader, nodeRequestHeaders, nodeRequestLifetime } from '@hulla/api-node'
import {
  bodyLimit,
  createAdapterHandler,
  errorResponse,
  toFetchResponse,
  type AdapterErrorInput,
  type AdapterResponse,
  type AdapterRuntimeOptions,
} from '@hulla/api/adapters'
import {
  assertAdapterContext,
  createServerAdapter,
  serverContextAdapterId,
  type Awaitable,
  type ServerAdapter,
  type ServerContextInput,
  type ServerExecutableFor,
} from '@hulla/api/server'
import type Koa from 'koa'

function readHeader(this: { readonly request: Koa.Context['req'] }, name: string): string | undefined {
  return nodeRequestHeader(this.request.headers, name)
}

export type KoaAdapterContext<State extends object = Koa.DefaultState> = {
  readonly ctx: Koa.ParameterizedContext<State>
  readonly state: State
}
export type KoaContextInput<
  C extends Contract = Contract,
  State extends object = Koa.DefaultState,
> = ServerContextInput<C> & KoaAdapterContext<State>
export type KoaServerErrorInput<State extends object = Koa.DefaultState> = Omit<AdapterErrorInput, 'hostContext'> &
  KoaAdapterContext<State>
export type KoaServerOptions<State extends object = Koa.DefaultState> = Omit<AdapterRuntimeOptions, 'onError'> & {
  readonly maxBodyBytes?: number
  readonly onError?: ((input: KoaServerErrorInput<State>) => Awaitable<AdapterResponse | undefined | void>) | undefined
}
export type KoaAdapter<State extends object = Koa.DefaultState> = ServerAdapter<'koa', KoaAdapterContext<State>> & {
  readonly mount: <const C extends Contract, const Context extends object>(
    implementation: ServerExecutableFor<C, Context, 'koa', KoaAdapterContext<State>>,
    options?: KoaServerOptions<State>
  ) => Koa.Middleware<State>
}

/** Mount as terminal middleware. Scope paths with the application's router when composing APIs. */
export function koaAdapter<State extends object = Koa.DefaultState>(
  defaults: KoaServerOptions<State> = {}
): KoaAdapter<State> {
  const configuredDefaults = { ...defaults }
  return createServerAdapter('koa', {
    mount: <const C extends Contract, const Context extends object>(
      implementation: ServerExecutableFor<C, Context, 'koa', KoaAdapterContext<State>>,
      overrides?: KoaServerOptions<State>
    ): Koa.Middleware<State> => {
      assertAdapterContext(implementation.context, 'koa')
      const options = { ...configuredDefaults, ...overrides }
      const limit = bodyLimit(options.maxBodyBytes)
      const native = serverContextAdapterId(implementation.context) !== undefined
      const dispatch = createAdapterHandler(
        implementation,
        options.onError === undefined
          ? {}
          : {
              onError: ({ hostContext, ...input }) =>
                options.onError?.({ ...input, ...(hostContext as KoaAdapterContext<State>) }),
            }
      )
      return async (ctx) => {
        const lifetime = nodeRequestLifetime(ctx.req, ctx.res)
        const host = { ctx, state: ctx.state }
        const observe = async (error: unknown) => {
          const fallback = errorResponse(error, 'transport')
          try {
            return (
              (await options.onError?.({
                ...host,
                request: ctx.req,
                error,
                phase: 'transport',
                defaultResponse: fallback,
              })) ?? fallback
            )
          } catch {
            return fallback
          }
        }
        let response: Response
        try {
          const parsed = (ctx.request as Koa.Request & { body?: unknown }).body
          const result = await dispatch({
            request: ctx.req,
            signal: lifetime.signal,
            method: ctx.method === 'HEAD' ? 'GET' : ctx.method,
            pathname: ctx.path,
            query: new URLSearchParams(ctx.querystring),
            readHeaders: () => nodeRequestHeaders(ctx.req.headers),
            readHeader,
            readBody: createNodeBodyReader(ctx.req, limit, 'Koa'),
            ...(parsed === undefined ? {} : { body: { value: parsed } }),
            ...(native ? { contextInput: host } : {}),
            ...(options.onError === undefined ? {} : { hostContext: host }),
          })
          response = toFetchResponse(result, async (error) => {
            await observe(error)
          })
        } catch (error) {
          try {
            response = toFetchResponse(await observe(error))
          } catch (failure) {
            lifetime.dispose()
            throw failure
          }
        }
        try {
          if (ctx.method === 'HEAD' || response.body === null) {
            await response.body?.cancel()
            ctx.body = null
          } else {
            ctx.body = Readable.fromWeb(response.body as import('node:stream/web').ReadableStream<Uint8Array>)
          }
          response.headers.forEach((value, name) => {
            if (name !== 'set-cookie') ctx.set(name, value)
          })
          const cookies = response.headers.getSetCookie()
          if (cookies.length > 0) ctx.set('set-cookie', cookies)
          ctx.status = response.status
        } catch (error) {
          lifetime.dispose()
          throw error
        }
      }
    },
  }) as unknown as KoaAdapter<State>
}
