import { query } from '@solidjs/router'

export const getHealth = query(async () => {
  'use server'
  const { api } = await import('./local')
  const result = await api.health()
  return result.body
}, 'fixture-health')
