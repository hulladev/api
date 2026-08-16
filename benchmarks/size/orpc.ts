import { createORPCClient } from '@orpc/client'
import { RPCLink } from '@orpc/client/fetch'
import { os, type RouterClient } from '@orpc/server'
import { RPCHandler } from '@orpc/server/fetch'
import { z } from 'zod'

const output = z.object({ ok: z.boolean() })
const router = { health: os.handler(() => output.parse({ ok: true })) }
const handler = new RPCHandler(router)
const link = new RPCLink({
  url: 'https://size.local/rpc',
  fetch: async (request, init) => {
    const result = await handler.handle(new Request(request, init), { prefix: '/rpc', context: {} })
    return result.matched ? result.response : new Response(null, { status: 404 })
  },
})

export const client: RouterClient<typeof router> = createORPCClient(link)
