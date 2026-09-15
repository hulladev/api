import type { Contract } from '@hulla/api'
import { createFetchHandler, type FetchServerErrorInput } from '@hulla/api/fetch'
import {
  createServerAdapter,
  type Awaitable,
  type ServerAdapter,
  type ServerContextInput,
  type ServerExecutableFor,
} from '@hulla/api/server'
import type { Context as NativeNetlifyContext, Config as NativeNetlifyConfig } from '@netlify/functions'

export type NetlifyContext = NativeNetlifyContext
export type NetlifyConfig = NativeNetlifyConfig

export type NetlifyFunction = (request: Request, context: NetlifyContext) => Promise<Response>

export type NetlifyAdapterContext = {
  readonly request: Request
  readonly netlifyContext: NetlifyContext
}

export type NetlifyContextInput<ContractType extends Contract> = ServerContextInput<ContractType> &
  NetlifyAdapterContext

export type NetlifyServerErrorInput = Omit<FetchServerErrorInput<NetlifyContext>, 'handlerContext'> & {
  readonly netlifyContext: NetlifyContext
}

export type NetlifyAdapterOptions = {
  readonly onError?: (input: NetlifyServerErrorInput) => Awaitable<Response | undefined | void>
}

export type NetlifyMountOptions = NetlifyAdapterOptions

type NetlifyMount = {
  <const ContractType extends Contract, const Context extends object>(
    implementation: ServerExecutableFor<ContractType, Context, 'netlify-functions', NetlifyAdapterContext>,
    options?: NetlifyMountOptions
  ): NetlifyFunction
}

export type NetlifyAdapter = ServerAdapter<'netlify-functions', NetlifyAdapterContext> & {
  readonly mount: NetlifyMount
}

function createNetlifyHandler<const ContractType extends Contract, const Context extends object>(
  implementation: ServerExecutableFor<ContractType, Context, 'netlify-functions', NetlifyAdapterContext>,
  options: NetlifyAdapterOptions
): NetlifyFunction {
  const handler = createFetchHandler<ContractType, Context, NetlifyContext, 'netlify-functions'>(implementation, {
    contextAdapter: 'netlify-functions',
    contextInput: (request: Request, netlifyContext: NetlifyContext) => ({
      request,
      netlifyContext,
    }),
    ...(options.onError === undefined
      ? {}
      : {
          onError: ({ handlerContext, ...input }: FetchServerErrorInput<NetlifyContext>) =>
            options.onError?.({
              ...input,
              netlifyContext: handlerContext,
            }),
        }),
  })

  return (request, context) => handler(request, context)
}

let netlifyFunctionsAdapterValue: unknown

function createNetlifyFunctionsAdapter(defaults: NetlifyAdapterOptions): NetlifyAdapter {
  return createServerAdapter('netlify-functions', {
    mount: <const ContractType extends Contract, const Context extends object>(
      implementation: ServerExecutableFor<ContractType, Context, 'netlify-functions', NetlifyAdapterContext>,
      options?: NetlifyMountOptions
    ) => createNetlifyHandler(implementation, options === undefined ? defaults : { ...defaults, ...options }),
  }) as unknown as NetlifyAdapter
}

export function netlifyFunctionsAdapter(options?: NetlifyAdapterOptions): NetlifyAdapter {
  if (options !== undefined) return createNetlifyFunctionsAdapter({ ...options })
  netlifyFunctionsAdapterValue ??= createNetlifyFunctionsAdapter({})
  return netlifyFunctionsAdapterValue as NetlifyAdapter
}
