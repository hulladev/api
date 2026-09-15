import { format } from 'node:util'

export const validationRejectionMessage = 'Preflight validation rejection'

/** Only used around sequential, untimed rejection assertions. */
export async function withExpectedValidationLogs(check: () => Promise<void>): Promise<void> {
  const original = console.error
  const captured: unknown[][] = []
  console.error = (...args: unknown[]) => {
    if (format(...args).includes(validationRejectionMessage)) captured.push(args)
    else original(...args)
  }
  try {
    await check()
  } catch (error) {
    for (const args of captured) original(...args)
    throw error
  } finally {
    console.error = original
  }
}
