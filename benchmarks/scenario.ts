import { z } from 'zod'

/** Shared wire schema and values used by every implementation. */
export const createUserInput = z.object({ name: z.string().min(1) })
export const createUserOutput = z.object({ id: z.string(), name: z.string() })
export const createUserValue = Object.freeze({ name: 'Ada' })
export const createdUserValue = Object.freeze({ id: 'user-1', name: 'Ada' })

export function assertCreatedUser(value: unknown): void {
  const result = createUserOutput.parse(value)
  if (result.id !== 'user-1' || result.name !== 'Ada') throw new Error('Unexpected benchmark result')
}
