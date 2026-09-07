import { nuxtFetchTransport } from '@hulla/api-nuxt/client'
import { defineClient } from '@hulla/api/client'
import { contract } from '~~/shared/api/contract'

export function useApi() {
  const requestFetch = useRequestFetch()
  return defineClient(contract, {
    transport: nuxtFetchTransport(requestFetch),
  })
}
