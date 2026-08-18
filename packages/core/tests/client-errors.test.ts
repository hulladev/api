import { describe, expect, test } from 'vitest'
import { isAPIError } from '../src'
import { ClientResponseError } from '../src/client'

describe('Fetch client errors', () => {
  test('uses the shared structured API error convention', () => {
    const response = new Response(null, { status: 418 })
    const error = new ClientResponseError('unexpected-status', response, 'Unexpected response status')

    expect(isAPIError(error)).toBe(true)
    expect(error).toMatchObject({
      code: 'unexpected-status',
      response,
      issues: [{ code: 'unexpected-status', location: 'response' }],
    })
  })
})
