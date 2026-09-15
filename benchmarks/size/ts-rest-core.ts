import { initClient, initContract, type ApiFetcher, type AppRouteQuery } from '@ts-rest/core'

type Output = { readonly ok: boolean }
const c = initContract()
const health: AppRouteQuery = {
  method: 'GET',
  path: '/health',
  responses: { 200: c.type<Output>() },
}
const contract: { readonly health: AppRouteQuery } = { health }
const api: ApiFetcher = async () => ({ status: 200, headers: new Headers(), body: { ok: true } })

export const client = initClient(contract, { baseUrl: 'https://size.local', api, validateResponse: true })
