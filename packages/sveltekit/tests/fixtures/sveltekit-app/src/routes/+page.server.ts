import { api } from '$lib/server/client'

export async function load() {
  const result = await api.health()
  return { initialHealth: result.body }
}
