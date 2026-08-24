import type { Contract } from '@hulla/api'
import { createFetchHandler, type FetchServerErrorInput } from '@hulla/api/fetch'
import {
  createServerAdapter,
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

export type CloudflareAdapter<
  Env = unknown,
  ExecutionContext extends CloudflareExecutionContext = CloudflareExecutionContext,
> = ServerAdapter<'cloudflare-workers', CloudflareAdapterContext<Env, ExecutionContext>>

const cloudflareAdapterDescriptor = /* @__PURE__ */ createServerAdapter('cloudflare-workers') as CloudflareAdapter

export function cloudflareAdapter<
  Env = unknown,
  ExecutionContext extends CloudflareExecutionContext = CloudflareExecutionContext,
>(): CloudflareAdapter<Env, ExecutionContext> {
  return cloudflareAdapterDescriptor as CloudflareAdapter<Env, ExecutionContext>
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
  readonly onError?: (
    input: CloudflareServerErrorInput<Env, ExecutionContext>
  ) => Awaitable<Response | undefined | void>
}

export type CloudflareContextInput<
  ContractType extends Contract = Contract,
  Env = unknown,
  ExecutionContext extends CloudflareExecutionContext = CloudflareExecutionContext,
> = ServerContextInput<ContractType> & CloudflareAdapterContext<Env, ExecutionContext>

/** Creates the `fetch` handler for a Cloudflare Module Worker. */
export function createWorkerHandler<
  const ContractType extends Contract,
  const Context extends object,
  Env = unknown,
  ExecutionContext extends CloudflareExecutionContext = CloudflareExecutionContext,
>(
  implementation: ServerExecutableFor<ContractType, Context, CloudflareAdapter<Env, ExecutionContext>>,
  options: CloudflareServerOptions<Env, ExecutionContext> = {}
): CloudflareWorkerHandler<Env, ExecutionContext> {
  type HandlerContext = CloudflareHandlerContext<Env, ExecutionContext>

  const usesNativeContext = implementation.adapter !== undefined && implementation.context !== undefined
  const handler = createFetchHandler<ContractType, Context, HandlerContext, CloudflareAdapter<Env, ExecutionContext>>(
    implementation,
    {
      contextAdapter: cloudflareAdapterDescriptor as CloudflareAdapter<Env, ExecutionContext>,
      ...(usesNativeContext ? { contextInput: (_request: Request, input: HandlerContext) => input } : {}),
      ...(options.onError === undefined
        ? {}
        : {
            onError: ({ handlerContext, ...input }: FetchServerErrorInput<HandlerContext>) =>
              options.onError?.({ ...input, ...handlerContext }),
          }),
    }
  )

  if (!usesNativeContext && options.onError === undefined) {
    return (request) => handler(request, undefined as unknown as HandlerContext)
  }
  return (request, env, ctx) => handler(request, { env, ctx })
}
