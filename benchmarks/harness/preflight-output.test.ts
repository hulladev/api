import { afterEach, expect, test, vi } from 'vitest'
import { validationRejectionMessage, withExpectedValidationLogs } from './preflight-output'

afterEach(() => vi.restoreAllMocks())

test('silences injected validation diagnostics but preserves unrelated errors', async () => {
  const logger = vi.spyOn(console, 'error').mockImplementation(() => {})
  await withExpectedValidationLogs(async () => {
    console.error('[framework] Unexpected error', new Error(validationRejectionMessage))
    console.error('Unrelated diagnostic')
  })
  expect(logger).toHaveBeenCalledExactlyOnceWith('Unrelated diagnostic')
  expect(console.error).toBe(logger)
})

test('replays validation diagnostics and restores logging when the assertion fails', async () => {
  const logger = vi.spyOn(console, 'error').mockImplementation(() => {})
  const diagnostic = new Error(validationRejectionMessage)
  await expect(
    withExpectedValidationLogs(async () => {
      console.error(diagnostic)
      throw new Error('Rejection assertion failed')
    })
  ).rejects.toThrow('Rejection assertion failed')
  expect(logger).toHaveBeenCalledExactlyOnceWith(diagnostic)
  expect(console.error).toBe(logger)
})
