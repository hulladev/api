import { createServerFn } from '@tanstack/react-start'

export const getHealth = createServerFn({ method: 'GET' }).handler(async () => {
  const { api } = await import('./local.server')
  const result = await api.health()
  return result.body
})
