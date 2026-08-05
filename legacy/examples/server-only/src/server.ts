import { createApi, type ProcedureExecutionContext } from '@hulla/api'
import { createApiHandler } from '@hulla/api/server'
import { z } from 'zod'

const api = createApi({
  middleware: {
    requestId: (context: ProcedureExecutionContext) =>
      context.request?.headers.get('x-request-id') ?? crypto.randomUUID(),
  },
})

export const greetings = api
  .router('greetings')
  .use('requestId')
  .define(({ procedure, route }) => ({
    normalize: procedure.input(z.string()).handler(({ input }) => input.trim()),

    hello: route('GET', '/hello/:name')
      .input(z.string())
      .output(z.object({ message: z.string(), requestId: z.string() }))
      .handler(async ({ input, getContext }) => {
        const { requestId } = await getContext()
        return { message: `Hello, ${input}!`, requestId }
      }),

    echo: route('POST', '/echo')
      .input(z.object({ message: z.string().min(1) }))
      .output(z.object({ message: z.string(), requestId: z.string() }))
      .handler(async ({ input, getContext }) => {
        const { requestId } = await getContext()
        return { message: input.message, requestId }
      }),
  }))

export const handler = createApiHandler({
  routers: { greetings },
  basePath: '/api',
})
