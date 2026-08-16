import { createTRPCClient, httpLink } from '@trpc/client'
import { initTRPC } from '@trpc/server'
import { fetchRequestHandler } from '@trpc/server/adapters/fetch'
import type { Benchmark } from './harness'
import { assertCreatedUser, createUserInput, createUserOutput, createUserValue, createdUserValue } from './scenario'

/** tRPC's HTTP client link and Fetch adapter. */
const t = initTRPC.create()
const appRouter = t.router({
  createUser: t.procedure
    .input(createUserInput)
    .output(createUserOutput)
    .mutation(() => createdUserValue),
})

const client = createTRPCClient<typeof appRouter>({
  links: [
    httpLink({
      url: 'https://bench.local/trpc',
      fetch: (input, init) =>
        fetchRequestHandler({
          endpoint: '/trpc',
          req: new Request(input, init as RequestInit | undefined),
          router: appRouter,
        }),
    }),
  ],
})

export const trpcBenchmark: Benchmark = {
  name: 'tRPC',
  async run() {
    const input = createUserInput.parse(createUserValue)
    assertCreatedUser(await client.createUser.mutate(input))
  },
}
