import { initClient, initContract, type ApiFetcher, type AppRouteQuery } from '@ts-rest/core'
import { createFetchHandler, tsr } from '@ts-rest/serverless/fetch'
import { z } from 'zod'

const output = z.object({ ok: z.boolean() })
type Output = z.infer<typeof output>
const c = initContract()
const health: AppRouteQuery = {
  method: 'GET',
  path: '/health',
  responses: { 200: c.type<Output>() },
}
const contract: { readonly health: AppRouteQuery } = { health }
const router = tsr.router(contract, {
  health: async () => ({ status: 200, body: output.parse({ ok: true }) }),
})
const handler = createFetchHandler(contract, router)
const api: ApiFetcher = async ({ path, method, headers }) => {
  const result = await handler(new Request(path, { method, headers }))
  return { status: result.status, headers: result.headers, body: output.parse(await result.json()) }
}

export const client = initClient(contract, { baseUrl: 'https://size.local', api, validateResponse: true })
