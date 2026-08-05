import { createClient } from '@fitness/api-client'
import { QueryClient } from '@tanstack/react-query'
import { apiBaseUrl } from './api'

export const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      retry: 1,
      staleTime: 10_000,
    },
  },
})

export const client = createClient({ baseUrl: apiBaseUrl, queryClient })

export const workoutsCollection = client.workouts.$tanstack.collection
export const createWorkout = workoutsCollection.create
