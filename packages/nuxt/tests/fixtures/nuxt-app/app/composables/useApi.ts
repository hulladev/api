import { nuxtFetchTransport } from '@hulla/api-nuxt/client'
import { defineClient } from '@hulla/api/client'
import { contract } from '~~/shared/api/contract'

export function useApi() {
  // useRequestFetch() may expose only parsed data during SSR.
  const event = useRequestEvent()
  const requestFetch = event ? { fetch: event.fetch } : $fetch
  return defineClient(contract, {
    transport: nuxtFetchTransport(requestFetch),
  })
}
