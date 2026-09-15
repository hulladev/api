import { command, form, query } from '$app/server'
import { implementation } from '$lib/server/api'
import { svelteKitRemoteTransport } from '@hulla/api-sveltekit/remote'
import { createClient } from '@hulla/api/client'
import { contract, renameInput } from '../api/contract'

const api = createClient(contract, {
  transport: svelteKitRemoteTransport(implementation),
})

export const health = query(async () => {
  const result = await api.health()
  if (result.status !== 200) throw new Error(`Unexpected health status: ${result.status}`)
  return result.body
})

export const rename = command(renameInput, async (body) => {
  const result = await api.rename({ body })
  if (result.status !== 200) throw new Error(`Unexpected rename status: ${result.status}`)
  return result.body
})

export const renameForm = form(renameInput, async (body) => {
  const result = await api.rename({ body })
  if (result.status !== 200) throw new Error(`Unexpected rename status: ${result.status}`)
  return result.body
})
