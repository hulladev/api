import { defineClient } from '@hulla/api/client'
import { fetchTransport } from '@hulla/api/fetch'
import { contract } from './contract'

// Omit baseUrl in the browser; an absolute URL also allows external consumers.
export function createBrowserApi(baseUrl?: string) {
  return defineClient(contract, {
    transport: fetchTransport(baseUrl === undefined ? {} : { baseUrl }),
  })
}

export const api = createBrowserApi()
