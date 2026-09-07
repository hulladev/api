import type { Contract } from '@hulla/api'
import { bodyLimit, readFetchBody, toFetchResponse, writeFetchResponse } from '@hulla/api/adapters'
import {
  createAdapterRuntime,
  type AdapterErrorInput,
  type AdapterResponse,
  type AdapterRoute,
  type AdapterRouteInput,
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
import type {
  Context as NativeHonoContext,
  Env as HonoEnv,
  Handler as NativeHonoHandler,
  Hono,
  Schema as HonoSchema,
} from 'hono'
import { cloneRawRequest } from 'hono/request'

type HonoAdapterContext<Env extends HonoEnv> = {
  readonly request: Request
  readonly honoContext: NativeHonoContext<Env>
}

export type HonoContext<Env extends HonoEnv = HonoEnv> = NativeHonoContext<Env>
export type HonoHandler<Env extends HonoEnv = HonoEnv> = NativeHonoHandler<Env>

export type HonoContextInput<
  ContractType extends Contract = Contract,
  Env extends HonoEnv = HonoEnv,
> = ServerContextInput<ContractType> & HonoAdapterContext<Env>

export type HonoServerErrorInput<Env extends HonoEnv = HonoEnv> = Omit<
  AdapterErrorInput,
  'defaultResponse' | 'hostContext' | 'request'
> &
  HonoAdapterContext<Env> & {
    readonly defaultResponse: Response
  }

export type HonoServerOptions<Env extends HonoEnv = HonoEnv> = {
  readonly preserveRequestBody?: boolean
  readonly maxBodyBytes?: number

  readonly onError?: ((input: HonoServerErrorInput<Env>) => Awaitable<Response | undefined | void>) | undefined
}

export type HonoAdapter<
  Env extends HonoEnv = HonoEnv,
  AppSchema extends HonoSchema = HonoSchema,
  BasePath extends string = string,
> = ServerAdapter<'hono', HonoAdapterContext<Env>> & {
  readonly mount: <const ContractType extends Contract, const Context extends object>(
    implementation: ServerExecutableFor<ContractType, Context, 'hono', HonoAdapterContext<Env>>,
    options?: HonoServerOptions<Env>
  ) => Hono<Env, AppSchema, BasePath>
}

function requestQuery(url: string): URLSearchParams | undefined {
  const start = url.indexOf('?')
  if (start === -1) return undefined
  const hash = url.indexOf('#', start + 1)
  return new URLSearchParams(url.slice(start + 1, hash === -1 ? undefined : hash))
}

async function readBody(
  context: NativeHonoContext,
  representation: string,
  preserveRequest: boolean,
  limit: number
): Promise<unknown> {
  if (!context.req.raw.bodyUsed) return readFetchBody(context.req.raw, representation, preserveRequest, limit)
  const cached = await cloneRawRequest(context.req)
  return readFetchBody(cached, representation, false, limit)
}

function replacementResponse(response: Response): AdapterResponse {
  return { status: response.status, headers: {}, body: { kind: 'raw', value: response } }
}

function createRouteHandler<Env extends HonoEnv>(
  route: AdapterRoute,
  usesNativeContext: boolean,
  includeHostContext: boolean,
  options: HonoServerOptions<Env>
): HonoHandler<Env> {
  const limit = bodyLimit(options.maxBodyBytes)
  return async (honoContext) => {
    const request = honoContext.req.raw
    const query = requestQuery(request.url)
    const nativeContext = { request, honoContext }
    const input: AdapterRouteInput = {
      request,
      signal: request.signal,
      preserveRequestBody: options.preserveRequestBody ?? false,
      ...(usesNativeContext ? { contextInput: nativeContext } : {}),
      params: honoContext.req.param(),
      ...(query === undefined ? {} : { query }),
      readHeaders: () => honoContext.req.header(),
      readBody: (representation, preserveRequest) => readBody(honoContext, representation, preserveRequest, limit),
      ...(includeHostContext ? { hostContext: honoContext } : {}),
    }
    return writeFetchResponse(
      await route.execute(input),
      options.onError === undefined
        ? undefined
        : (error) =>
            options.onError?.({
              ...error,
              ...nativeContext,
              route: { key: route.key, method: route.method, path: route.path },
            })
    )
  }
}

function createRouteHandlers<const ContractType extends Contract, const Context extends object, Env extends HonoEnv>(
  implementation: ServerExecutableFor<ContractType, Context, 'hono', HonoAdapterContext<Env>>,
  options: HonoServerOptions<Env>
): readonly (Pick<AdapterRoute, 'method' | 'path'> & { readonly handler: HonoHandler<Env> })[] {
  assertAdapterContext(implementation.context, 'hono')
  const usesNativeContext = serverContextAdapterId(implementation.context) !== undefined
  const runtime = createAdapterRuntime(
    implementation,
    options.onError === undefined
      ? {}
      : {
          onError: async ({ hostContext, ...input }) => {
            const honoContext = hostContext as NativeHonoContext<Env>
            const replacement = await options.onError?.({
              ...input,
              request: input.request as Request,
              honoContext,
              defaultResponse: toFetchResponse(input.defaultResponse).clone(),
            })
            return replacement instanceof Response ? replacementResponse(replacement) : undefined
          },
        }
  )
  return runtime.routes.map((route) => ({
    method: route.method,
    path: route.path,
    handler: createRouteHandler<Env>(route, usesNativeContext, options.onError !== undefined, options),
  }))
}

function mountHono<
  const ContractType extends Contract,
  const Context extends object,
  Env extends HonoEnv,
  AppSchema extends HonoSchema,
  BasePath extends string,
>(
  app: Hono<Env, AppSchema, BasePath>,
  implementation: ServerExecutableFor<ContractType, Context, 'hono', HonoAdapterContext<Env>>,
  options: HonoServerOptions<Env>
): Hono<Env, AppSchema, BasePath> {
  const routes = createRouteHandlers(implementation, options)
  for (const route of routes) app.on(route.method, route.path, route.handler)
  return app
}

/** Creates a Hono adapter bound to one caller-owned application. */
export function honoAdapter<
  Env extends HonoEnv = HonoEnv,
  AppSchema extends HonoSchema = HonoSchema,
  BasePath extends string = string,
>(app: Hono<Env, AppSchema, BasePath>, defaults: HonoServerOptions<Env> = {}): HonoAdapter<Env, AppSchema, BasePath> {
  const configuredDefaults = { ...defaults }
  return createServerAdapter('hono', {
    mount: <const ContractType extends Contract, const Context extends object>(
      implementation: ServerExecutableFor<ContractType, Context, 'hono', HonoAdapterContext<Env>>,
      options?: HonoServerOptions<Env>
    ) =>
      mountHono(
        app,
        implementation,
        options === undefined ? configuredDefaults : { ...configuredDefaults, ...options }
      ),
  }) as unknown as HonoAdapter<Env, AppSchema, BasePath>
}
