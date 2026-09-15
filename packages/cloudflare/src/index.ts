import type { Contract } from '@hulla/api'
import { createFetchHandler, type FetchServerErrorInput } from '@hulla/api/fetch'
import {
  createServerAdapter,
  serverContextAdapterId,
  type Awaitable,
  type ServerAdapter,
  type ServerContextInput,
  type ServerExecutableFor,
} from '@hulla/api/server'

/** The portable part of Cloudflare's generated `ExecutionContext` type used by an HTTP Worker. */
export type CloudflareExecutionContext = {
  readonly passThroughOnException: () => void
  readonly waitUntil: (promise: Promise<unknown>) => void
}

export type CloudflareWorkerHandler<
  Env = unknown,
  ExecutionContext extends CloudflareExecutionContext = CloudflareExecutionContext,
> = (request: Request, env: Env, ctx: ExecutionContext) => Promise<Response>

type CloudflareAdapterContext<Env, ExecutionContext extends CloudflareExecutionContext> = {
  readonly request: Request
  readonly env: Env
  readonly ctx: ExecutionContext
}

type CloudflareHandlerContext<Env, ExecutionContext extends CloudflareExecutionContext> = {
  readonly env: Env
  readonly ctx: ExecutionContext
}

export type CloudflareServerErrorInput<
  Env = unknown,
  ExecutionContext extends CloudflareExecutionContext = CloudflareExecutionContext,
> = Omit<FetchServerErrorInput<CloudflareHandlerContext<Env, ExecutionContext>>, 'handlerContext'> & {
  readonly env: Env
  readonly ctx: ExecutionContext
}

export type CloudflareServerOptions<
  Env = unknown,
  ExecutionContext extends CloudflareExecutionContext = CloudflareExecutionContext,
> = {
  readonly onError?:
    | ((input: CloudflareServerErrorInput<Env, ExecutionContext>) => Awaitable<Response | undefined | void>)
    | undefined
}

export type CloudflareContextInput<
  ContractType extends Contract = Contract,
  Env = unknown,
  ExecutionContext extends CloudflareExecutionContext = CloudflareExecutionContext,
> = ServerContextInput<ContractType> & CloudflareAdapterContext<Env, ExecutionContext>

export type CloudflareAdapter<
  Env = unknown,
  ExecutionContext extends CloudflareExecutionContext = CloudflareExecutionContext,
> = ServerAdapter<'cloudflare-workers', CloudflareAdapterContext<Env, ExecutionContext>> & {
  readonly mount: <const ContractType extends Contract, const Context extends object>(
    implementation: ServerExecutableFor<
      ContractType,
      Context,
      'cloudflare-workers',
      CloudflareAdapterContext<Env, ExecutionContext>
    >,
    options?: CloudflareServerOptions<Env, ExecutionContext>
  ) => CloudflareWorkerHandler<Env, ExecutionContext>
}

/** Creates the `fetch` handler for a Cloudflare Module Worker. */
function createWorkerHandler<
  const ContractType extends Contract,
  const Context extends object,
  Env = unknown,
  ExecutionContext extends CloudflareExecutionContext = CloudflareExecutionContext,
>(
  implementation: ServerExecutableFor<
    ContractType,
    Context,
    'cloudflare-workers',
    CloudflareAdapterContext<Env, ExecutionContext>
  >,
  options: CloudflareServerOptions<Env, ExecutionContext> = {}
): CloudflareWorkerHandler<Env, ExecutionContext> {
  type HandlerContext = CloudflareHandlerContext<Env, ExecutionContext>

  const usesNativeContext = serverContextAdapterId(implementation.context) !== undefined
  const handler = createFetchHandler<ContractType, Context, HandlerContext, 'cloudflare-workers'>(implementation, {
    contextAdapter: 'cloudflare-workers',
    ...(usesNativeContext ? { contextInput: (_request: Request, input: HandlerContext) => input } : {}),
    ...(options.onError === undefined
      ? {}
      : {
          onError: ({ handlerContext, ...input }: FetchServerErrorInput<HandlerContext>) =>
            options.onError?.({ ...input, ...handlerContext }),
        }),
  })

  if (!usesNativeContext && options.onError === undefined) {
    return (request) => handler(request, undefined as unknown as HandlerContext)
  }
  return (request, env, ctx) => handler(request, { env, ctx })
}

let cloudflareAdapterValue: unknown

function createCloudflareAdapter<Env, ExecutionContext extends CloudflareExecutionContext>(
  defaults: CloudflareServerOptions<Env, ExecutionContext>
): CloudflareAdapter<Env, ExecutionContext> {
  return createServerAdapter('cloudflare-workers', {
    mount: <const ContractType extends Contract, const Context extends object>(
      implementation: ServerExecutableFor<
        ContractType,
        Context,
        'cloudflare-workers',
        CloudflareAdapterContext<Env, ExecutionContext>
      >,
      options?: CloudflareServerOptions<Env, ExecutionContext>
    ) => createWorkerHandler(implementation, options === undefined ? defaults : { ...defaults, ...options }),
  }) as unknown as CloudflareAdapter<Env, ExecutionContext>
}

/** Creates a Cloudflare Workers adapter with native context and mounting operations. */
export function cloudflareAdapter<
  Env = unknown,
  ExecutionContext extends CloudflareExecutionContext = CloudflareExecutionContext,
>(options?: CloudflareServerOptions<Env, ExecutionContext>): CloudflareAdapter<Env, ExecutionContext> {
  if (options !== undefined) return createCloudflareAdapter({ ...options })
  cloudflareAdapterValue ??= createCloudflareAdapter<unknown, CloudflareExecutionContext>({})
  return cloudflareAdapterValue as CloudflareAdapter<Env, ExecutionContext>
}
