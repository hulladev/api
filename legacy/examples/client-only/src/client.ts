import { swrPlugin } from '@hulla/api-swr'
import { tanstackQueryPlugin } from '@hulla/api-tanstack-query'
import { createApi } from '@hulla/api/runtime'
import { z } from 'zod'

const userSchema = z.object({
  id: z.string(),
  name: z.string(),
})

const createUserSchema = userSchema.omit({ id: true })

export type User = z.infer<typeof userSchema>

export type UserTransport = {
  list: () => Promise<User[]>
  get: (id: string) => Promise<User | null>
  create: (input: z.infer<typeof createUserSchema>) => Promise<User>
}

export function createUserClient(transport: UserTransport) {
  const api = createApi({
    plugins: [tanstackQueryPlugin(), swrPlugin()],
  })

  return api.router('users').define(({ procedure }) => ({
    list: procedure.output(userSchema.array()).handler(() => transport.list()),

    byId: procedure
      .input(z.string())
      .output(userSchema.nullable())
      .handler(({ input }) => transport.get(input)),

    create: procedure
      .input(createUserSchema)
      .output(userSchema)
      .handler(({ input }) => transport.create(input)),
  }))
}
