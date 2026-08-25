import type { Contract } from '@hulla/api'
import { createFetchHandler, type FetchServerErrorInput } from '@hulla/api/fetch'
import {
  bindAdapterContext,
  type AdapterContextFactory,
  type Awaitable,
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

export type CloudflareContextFactory<
  Context extends object,
  ContractType extends Contract = Contract,
  Env = unknown,
  ExecutionContext extends CloudflareExecutionContext = CloudflareExecutionContext,
> = AdapterContextFactory<
  'cloudflare-workers',
  CloudflareAdapterContext<Env, ExecutionContext>,
  Context,
  ServerContextInput<ContractType>
>

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

export function cloudflareContext<
  Env = unknown,
  ExecutionContext extends CloudflareExecutionContext = CloudflareExecutionContext,
>(): <const Context extends object, ContractType extends Contract = Contract>(
  factory: (input: CloudflareContextInput<ContractType, Env, ExecutionContext>) => Awaitable<Context>
) => CloudflareContextFactory<Context, ContractType, Env, ExecutionContext>
export function cloudflareContext<
  const Context extends object,
  ContractType extends Contract = Contract,
  Env = unknown,
  ExecutionContext extends CloudflareExecutionContext = CloudflareExecutionContext,
>(
  factory: (input: CloudflareContextInput<ContractType, Env, ExecutionContext>) => Awaitable<Context>
): CloudflareContextFactory<Context, ContractType, Env, ExecutionContext>
export function cloudflareContext(factory?: Function): unknown {
  const bind = (value: Function) =>
    bindAdapterContext('cloudflare-workers', value as (input: object) => Awaitable<object>)
  return factory === undefined ? bind : bind(factory)
}

/** Creates the `fetch` handler for a Cloudflare Module Worker. */
export function createWorkerHandler<
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

  const usesContext = implementation.context !== undefined
  const handler = createFetchHandler<ContractType, Context, HandlerContext, 'cloudflare-workers'>(implementation, {
    contextAdapter: 'cloudflare-workers',
    ...(usesContext ? { contextInput: (_request: Request, input: HandlerContext) => input } : {}),
    ...(options.onError === undefined
      ? {}
      : {
          onError: ({ handlerContext, ...input }: FetchServerErrorInput<HandlerContext>) =>
            options.onError?.({ ...input, ...handlerContext }),
        }),
  })

  if (!usesContext && options.onError === undefined) {
    return (request) => handler(request, undefined as unknown as HandlerContext)
  }
  return (request, env, ctx) => handler(request, { env, ctx })
}
