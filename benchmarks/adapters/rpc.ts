import { os } from '@orpc/server'
import { RPCHandler } from '@orpc/server/fetch'
import { initTRPC } from '@trpc/server'
import { fetchRequestHandler } from '@trpc/server/adapters/fetch'
import {
  adapterDynamicBody,
  adapterDynamicInput,
  adapterDynamicOutput,
  adapterDynamicValue,
  adapterRequest,
  adapterStaticOutput,
  adapterStaticValue,
} from '../fixtures/adapter-workload'

const t = initTRPC.create()

export const trpcRouter = t.router({
  static: t.procedure.output(adapterStaticOutput).query(() => adapterStaticValue),
  dynamic: t.procedure
    .input(adapterDynamicInput)
    .output(adapterDynamicOutput)
    .mutation(({ input }) => input),
})

export function trpcAdapterRequest(dynamic: boolean): Request {
  return adapterRequest(dynamic ? '/trpc/dynamic' : '/trpc/static', dynamic ? adapterDynamicBody : undefined)
}

export function handleTrpcAdapterRequest(request: Request): Promise<Response> {
  return fetchRequestHandler({ endpoint: '/trpc', req: request, router: trpcRouter })
}

export async function assertTrpcAdapterResponse(response: Response, dynamic: boolean): Promise<void> {
  if (response.status !== 200) throw new Error('Unexpected tRPC adapter status')
  const envelope = (await response.json()) as { readonly result?: { readonly data?: unknown } }
  if (dynamic) adapterDynamicOutput.parse(envelope.result?.data)
  else if (!adapterStaticOutput.parse(envelope.result?.data).ok) throw new Error('Unexpected tRPC adapter result')
}

export const orpcRouter = {
  static: os.output(adapterStaticOutput).handler(() => adapterStaticValue),
  dynamic: os
    .input(adapterDynamicInput)
    .output(adapterDynamicOutput)
    .handler(({ input }) => input),
}

const orpcHandler = new RPCHandler(orpcRouter)

export function orpcAdapterRequest(dynamic: boolean): Request {
  return adapterRequest(
    dynamic ? '/rpc/dynamic' : '/rpc/static',
    dynamic ? JSON.stringify({ json: adapterDynamicValue }) : '{}'
  )
}

export async function handleOrpcAdapterRequest(request: Request): Promise<Response> {
  const result = await orpcHandler.handle(request, { prefix: '/rpc', context: {} })
  if (!result.matched || result.response === undefined) return new Response(null, { status: 404 })
  return result.response
}

export async function assertOrpcAdapterResponse(response: Response, dynamic: boolean): Promise<void> {
  if (response.status !== 200) throw new Error('Unexpected oRPC adapter status')
  const envelope = (await response.json()) as { readonly json?: unknown }
  if (dynamic) adapterDynamicOutput.parse(envelope.json)
  else if (!adapterStaticOutput.parse(envelope.json).ok) throw new Error('Unexpected oRPC adapter result')
}
