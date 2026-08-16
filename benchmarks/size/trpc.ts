import { createTRPCClient, httpLink } from '@trpc/client'
import { initTRPC } from '@trpc/server'
import { fetchRequestHandler } from '@trpc/server/adapters/fetch'
import { z } from 'zod'

const output = z.object({ ok: z.boolean() })
const t = initTRPC.create()
const router = t.router({ health: t.procedure.query(() => output.parse({ ok: true })) })

export const client = createTRPCClient<typeof router>({
  links: [
    httpLink({
      url: 'https://size.local/trpc',
      fetch: (input, init) =>
        fetchRequestHandler({
          endpoint: '/trpc',
          req: new Request(input, init as RequestInit | undefined),
          router,
        }),
    }),
  ],
})
