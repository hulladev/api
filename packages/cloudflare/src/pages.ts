import type { Contract } from '@hulla/api'
import { createFetchHandler, type FetchServerErrorInput } from '@hulla/api/fetch'
import {
  createServerAdapter,
  type Awaitable,
  type ServerAdapter,
  type ServerContextInput,
  type ServerExecutableFor,
} from '@hulla/api/server'

export type CloudflarePagesFetcher = {
  readonly fetch: typeof fetch
}

export type CloudflarePagesParams<Param extends string = string> = Record<Param, string | string[]>

/** The native context supplied to a Cloudflare Pages Function. */
export type CloudflarePagesEventContext<
  Env = unknown,
  Param extends string = string,
  Data extends Record<string, unknown> = Record<string, unknown>,
> = {
  readonly request: Request
  readonly functionPath: string
  readonly waitUntil: (promise: Promise<unknown>) => void
  readonly passThroughOnException: () => void
  readonly next: (input?: Request | string, init?: RequestInit) => Promise<Response>
  readonly env: Env & { readonly ASSETS: CloudflarePagesFetcher }
  readonly params: CloudflarePagesParams<Param>
  readonly data: Data
}

export type CloudflarePagesFunction<
  Env = unknown,
  Param extends string = string,
  Data extends Record<string, unknown> = Record<string, unknown>,
> = (context: CloudflarePagesEventContext<Env, Param, Data>) => Promise<Response>

export type CloudflarePagesContextInput<
  ContractType extends Contract = Contract,
  Env = unknown,
  Param extends string = string,
  Data extends Record<string, unknown> = Record<string, unknown>,
> = ServerContextInput<ContractType> & CloudflarePagesEventContext<Env, Param, Data>

export type CloudflarePagesServerErrorInput<
  Env = unknown,
  Param extends string = string,
  Data extends Record<string, unknown> = Record<string, unknown>,
> = Omit<FetchServerErrorInput<CloudflarePagesEventContext<Env, Param, Data>>, 'handlerContext'> &
  CloudflarePagesEventContext<Env, Param, Data>

export type CloudflarePagesServerOptions<
  Env = unknown,
  Param extends string = string,
  Data extends Record<string, unknown> = Record<string, unknown>,
> = {
  readonly onError?:
    | ((input: CloudflarePagesServerErrorInput<Env, Param, Data>) => Awaitable<Response | undefined | void>)
    | undefined
}

export type CloudflarePagesAdapter<
  Env = unknown,
  Param extends string = string,
  Data extends Record<string, unknown> = Record<string, unknown>,
> = ServerAdapter<'cloudflare-pages', CloudflarePagesEventContext<Env, Param, Data>> & {
  readonly mount: <const ContractType extends Contract, const Context extends object>(
    implementation: ServerExecutableFor<
      ContractType,
      Context,
      'cloudflare-pages',
      CloudflarePagesEventContext<Env, Param, Data>
    >,
    options?: CloudflarePagesServerOptions<Env, Param, Data>
  ) => CloudflarePagesFunction<Env, Param, Data>
}

function createPagesHandler<
  const ContractType extends Contract,
  const Context extends object,
  Env,
  Param extends string,
  Data extends Record<string, unknown>,
>(
  implementation: ServerExecutableFor<
    ContractType,
    Context,
    'cloudflare-pages',
    CloudflarePagesEventContext<Env, Param, Data>
  >,
  options: CloudflarePagesServerOptions<Env, Param, Data>
): CloudflarePagesFunction<Env, Param, Data> {
  type EventContext = CloudflarePagesEventContext<Env, Param, Data>

  const handler = createFetchHandler<ContractType, Context, EventContext, 'cloudflare-pages'>(implementation, {
    contextAdapter: 'cloudflare-pages',
    contextInput: (_request, eventContext) => eventContext,
    ...(options.onError === undefined
      ? {}
      : {
          onError: ({ handlerContext, ...input }: FetchServerErrorInput<EventContext>) =>
            options.onError?.({ ...handlerContext, ...input }),
        }),
  })

  return (eventContext) => handler(eventContext.request, eventContext)
}

let cloudflarePagesAdapterValue: unknown

function createCloudflarePagesAdapter<Env, Param extends string, Data extends Record<string, unknown>>(
  defaults: CloudflarePagesServerOptions<Env, Param, Data>
): CloudflarePagesAdapter<Env, Param, Data> {
  return createServerAdapter('cloudflare-pages', {
    mount: <const ContractType extends Contract, const Context extends object>(
      implementation: ServerExecutableFor<
        ContractType,
        Context,
        'cloudflare-pages',
        CloudflarePagesEventContext<Env, Param, Data>
      >,
      options?: CloudflarePagesServerOptions<Env, Param, Data>
    ) => createPagesHandler(implementation, options === undefined ? defaults : { ...defaults, ...options }),
  }) as unknown as CloudflarePagesAdapter<Env, Param, Data>
}

/** Creates a Cloudflare Pages Functions adapter with native event context and mounting operations. */
export function cloudflarePagesAdapter<
  Env = unknown,
  Param extends string = string,
  Data extends Record<string, unknown> = Record<string, unknown>,
>(options?: CloudflarePagesServerOptions<Env, Param, Data>): CloudflarePagesAdapter<Env, Param, Data> {
  if (options !== undefined) return createCloudflarePagesAdapter({ ...options })
  cloudflarePagesAdapterValue ??= createCloudflarePagesAdapter<unknown, string, Record<string, unknown>>({})
  return cloudflarePagesAdapterValue as CloudflarePagesAdapter<Env, Param, Data>
}
